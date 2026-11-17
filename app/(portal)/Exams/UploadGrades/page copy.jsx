'use client';
// app/(portal)/Staff/UploadGrades/page.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { GradeAndAttendance } from '@/app/lib/gradeAttendanceFirebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';

const STUDY_LEVELS = [
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'Postgraduate / Masters',
];

export default function UploadExamsGradesPage() {
  const { user } = useAuth();

  // ---------------------------------------------------------------------------
  // READ AUTH & SUBMITTER METADATA FROM LOCAL STORAGE & AUTH CONTEXT
  // ---------------------------------------------------------------------------
  const [localUserData, setLocalUserData] = useState(null);

  useEffect(() => {
    try {
      const storedUser =
        localStorage.getItem('user') ||
        localStorage.getItem('authUser') ||
        localStorage.getItem('session');

      if (storedUser) {
        setLocalUserData(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error('Failed to parse user from localStorage:', e);
    }
  }, []);

  // ✅ Institution ID Resolution
  const institutionId =
    localUserData?.institutionID ||
    localUserData?.schoolId ||
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    '';

  // ✅ Submitter Name Resolution
  const submitterName =
    localUserData?.data?.adminName ||
    localUserData?.adminName ||
    localUserData?.data?.fullName ||
    user?.data?.adminName ||
    user?.fullName ||
    user?.displayName ||
    'Academic Staff';

  const submitterEmail = localUserData?.data?.email || user?.email || user?.data?.email || '';
  const submitterId =
    localUserData?.data?.adminID ||
    localUserData?.adminID ||
    user?.data?.adminID ||
    user?.uid ||
    '';

  // --- Core Cascading Filter States ---
  const [academicYear, setAcademicYear] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [programmeId, setProgrammeId] = useState('');
  const [studyLevel, setStudyLevel] = useState(STUDY_LEVELS[0]);
  const [selectedModuleId, setSelectedModuleId] = useState('');

  // --- Master Data Stores ---
  const [semesters, setSemesters] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [allModules, setAllModules] = useState([]);
  const [allOfferings, setAllOfferings] = useState([]);
  const [gradingScales, setGradingScales] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [existingGrades, setExistingGrades] = useState({});

  // --- Grade Input State Map ---
  const [studentGradesInput, setStudentGradesInput] = useState({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState(null); // Track individual row saving
  const [message, setMessage] = useState({ type: '', text: '' });

  // ---------------------------------------------------------------------------
  // 1. FETCH BASELINE DATA & GRADING SCALES STRICTLY BY INSTITUTION
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!institutionId || institutionId === 'N/A') {
      setLoading(false);
      return;
    }

    const fetchBaseData = async () => {
      setLoading(true);
      try {
        const qSemesters = query(collection(db, 'semesters'), where('institutionId', '==', institutionId));
        const qProgrammes = query(collection(db, 'programmes'), where('institutionId', '==', institutionId));
        const qModules = query(collection(db, 'programme_modules'), where('institutionId', '==', institutionId));
        const qOfferings = query(collection(db, 'programme_module_offerings'), where('institutionId', '==', institutionId));
        const qScales = query(collection(GradeAndAttendance, 'grading_scales'), where('institutionID', '==', institutionId));
        const qStudents = query(collection(db, 'students'), where('institutionID', '==', institutionId));

        const [sSnap, pSnap, mSnap, oSnap, scaleSnap, studSnap] = await Promise.all([
          getDocs(qSemesters),
          getDocs(qProgrammes),
          getDocs(qModules),
          getDocs(qOfferings),
          getDocs(qScales),
          getDocs(qStudents),
        ]);

        const loadedSemesters = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedProgrammes = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedModules = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedOfferings = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedScales = scaleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedStudents = studSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        loadedScales.sort((a, b) => b.minScore - a.minScore);

        setSemesters(loadedSemesters);
        setProgrammes(loadedProgrammes);
        setAllModules(loadedModules);
        setAllOfferings(loadedOfferings);
        setGradingScales(loadedScales);
        setStudentsList(loadedStudents);

        if (loadedProgrammes.length > 0) setProgrammeId(loadedProgrammes[0].id);
        if (loadedSemesters.length > 0) {
          const activeSem = loadedSemesters.find((s) => s.status === 'Active') || loadedSemesters[0];
          setAcademicYear(activeSem.academicYear);
          setSemesterId(activeSem.id);
        }
      } catch (err) {
        console.error('Error loading grading base data:', err);
        setMessage({ type: 'error', text: 'Failed to load system references.' });
      } finally {
        setLoading(false);
      }
    };

    fetchBaseData();
  }, [institutionId]);

  // ---------------------------------------------------------------------------
  // 2. REAL-TIME SUBSCRIPTION TO SUBMITTED EXAM GRADES
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!institutionId || institutionId === 'N/A') return;

    const qGrades = query(
      collection(GradeAndAttendance, 'exams_grades'),
      where('institutionID', '==', institutionId)
    );

    const unsubscribe = onSnapshot(
      qGrades,
      (snapshot) => {
        const gradeMap = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const key = `${data.studentId}_${data.moduleId || data.courseCode}_${data.semesterId || ''}`;
          gradeMap[key] = { id: docSnap.id, ...data };
        });
        setExistingGrades(gradeMap);
      },
      (err) => console.error('Error listening to grades:', err)
    );

    return () => unsubscribe();
  }, [institutionId]);

  // ---------------------------------------------------------------------------
  // 3. CASCADING FILTER LOGIC
  // ---------------------------------------------------------------------------
  const availableAcademicYears = useMemo(() => {
    const years = semesters.map((s) => s.academicYear).filter(Boolean);
    return Array.from(new Set(years));
  }, [semesters]);

  const filteredSemestersForYear = useMemo(() => {
    if (!academicYear) return semesters;
    return semesters.filter((s) => s.academicYear === academicYear);
  }, [semesters, academicYear]);

  useEffect(() => {
    if (filteredSemestersForYear.length > 0) {
      if (!filteredSemestersForYear.some((s) => s.id === semesterId)) {
        const activeSem = filteredSemestersForYear.find((s) => s.status === 'Active');
        setSemesterId(activeSem ? activeSem.id : filteredSemestersForYear[0].id);
      }
    } else {
      setSemesterId('');
    }
  }, [academicYear, filteredSemestersForYear, semesterId]);

  const modulesMap = useMemo(() => new Map(allModules.map((m) => [m.id, m])), [allModules]);
  const programmeMap = useMemo(() => new Map(programmes.map((p) => [p.id, p])), [programmes]);
  const semesterMap = useMemo(() => new Map(semesters.map((s) => [s.id, s])), [semesters]);

  const availableModulesForSelection = useMemo(() => {
    if (!programmeId || !semesterId) return [];

    const offeringMatch = allOfferings.find(
      (o) =>
        o.programmeId === programmeId &&
        o.semesterId === semesterId &&
        o.studyLevel === studyLevel
    );

    if (offeringMatch && offeringMatch.moduleIds && offeringMatch.moduleIds.length > 0) {
      return offeringMatch.moduleIds.map((id) => modulesMap.get(id)).filter(Boolean);
    }

    return allModules.filter(
      (m) =>
        (m.programmeId === programmeId || m.programme === programmeId) &&
        (!m.studyLevel || m.studyLevel === studyLevel)
    );
  }, [allOfferings, programmeId, semesterId, studyLevel, allModules, modulesMap]);

  useEffect(() => {
    if (availableModulesForSelection.length > 0) {
      if (!availableModulesForSelection.some((m) => m.id === selectedModuleId)) {
        setSelectedModuleId(availableModulesForSelection[0].id);
      }
    } else {
      setSelectedModuleId('');
    }
  }, [availableModulesForSelection, selectedModuleId]);

  const classStudents = useMemo(() => {
    if (!programmeId) return [];
    return studentsList.filter(
      (s) =>
        (s.programmeId === programmeId || s.programme === programmeId) &&
        (!studyLevel || s.studyLevel === studyLevel)
    );
  }, [studentsList, programmeId, studyLevel]);

  useEffect(() => {
    const initialInputs = {};
    classStudents.forEach((student) => {
      const key = `${student.studentId}_${selectedModuleId}_${semesterId}`;
      const existing = existingGrades[key];

      // ✅ Formats gradePoint with 2 decimal places if it exists (e.g. 4.0 becomes "4.00")
      const formattedGP = existing?.gradePoint !== undefined && existing?.gradePoint !== null && existing?.gradePoint !== ''
        ? Number(existing.gradePoint).toFixed(2)
        : '';

      initialInputs[student.studentId] = {
        score: existing?.score !== undefined && existing?.score !== null ? existing.score : '',
        gradeStatus: existing?.gradeStatus || '',
        gradePoint: formattedGP,
        remarks: existing?.remarks || '',
        submittedBy: existing?.submittedBy || submitterName,
      };
    });
    setStudentGradesInput(initialInputs);
  }, [classStudents, selectedModuleId, semesterId, existingGrades, submitterName]);

  // ---------------------------------------------------------------------------
  // 4. AUTOMATIC GRADE & GPA EVALUATION
  // ---------------------------------------------------------------------------
  const evaluateGradeDetails = (numericScore) => {
    if (numericScore === '' || numericScore === null || isNaN(numericScore)) {
      return { grade: '', gradePoint: '' };
    }
    const score = Number(numericScore);

    for (const scale of gradingScales) {
      if (score >= scale.minScore && score <= scale.maxScore) {
        const gp = scale.gradePoint !== undefined && scale.gradePoint !== null 
          ? Number(scale.gradePoint).toFixed(2) 
          : '';
        return {
          grade: scale.grade,
          gradePoint: gp,
        };
      }
    }

    const fallbackGP = score >= 50 ? (2.0).toFixed(2) : (0.0).toFixed(2);
    return { grade: score >= 50 ? 'C' : 'F', gradePoint: fallbackGP };
  };

  const handleScoreChange = (studentId, value) => {
    const { grade, gradePoint } = evaluateGradeDetails(value);

    setStudentGradesInput((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        score: value,
        gradeStatus: grade,
        gradePoint: gradePoint,
        submittedBy: submitterName,
      },
    }));
  };

  const handleRemarkChange = (studentId, remarkValue) => {
    setStudentGradesInput((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks: remarkValue,
        submittedBy: submitterName,
      },
    }));
  };

  // ---------------------------------------------------------------------------
  // 5. VALIDATION: Check if any student score is empty or out of range (< 0)
  // ---------------------------------------------------------------------------
  const hasEmptyOrInvalidScores = useMemo(() => {
    if (classStudents.length === 0) return true;
    return classStudents.some((student) => {
      const scoreVal = studentGradesInput[student.studentId]?.score;
      if (scoreVal === '' || scoreVal === undefined || scoreVal === null) return true;
      const num = Number(scoreVal);
      return isNaN(num) || num < 0 || num > 100;
    });
  }, [classStudents, studentGradesInput]);

  // Helper payload generator for single/bulk submissions
  const buildGradePayload = (student) => {
    const studentInput = studentGradesInput[student.studentId] || {
      score: '',
      gradeStatus: '',
      gradePoint: '',
      remarks: '',
      submittedBy: submitterName,
    };

    const currentModule = modulesMap.get(selectedModuleId);
    const currentProg = programmeMap.get(programmeId);
    const currentSem = semesterMap.get(semesterId);
    const scoreNum = studentInput.score !== '' && !isNaN(studentInput.score) ? Number(studentInput.score) : 0;

    return {
      institutionID: institutionId,
      studentId: student.studentId,
      studentName: student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      programmeId: programmeId,
      programmeName: currentProg?.programmeName || currentProg?.name || '',
      studyLevel: studyLevel,
      moduleId: selectedModuleId,
      courseCode: currentModule?.moduleCode || currentModule?.code || 'MOD',
      courseTitle: currentModule?.moduleTitle || currentModule?.title || 'Module',
      academicYear: academicYear,
      semesterId: semesterId,
      semesterName: currentSem?.semesterName || currentSem?.code || 'Semester',
      score: scoreNum,
      gradeStatus: studentInput.gradeStatus,
      // ✅ Stores numeric value in DB, but keeps 2 decimal points formatted string/number
      gradePoint: studentInput.gradePoint !== '' ? Number(studentInput.gradePoint) : 0,
      remarks: studentInput.remarks,
      submittedBy: submitterName,
      submittedByEmail: submitterEmail,
      submittedById: submitterId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
  };

  // ---------------------------------------------------------------------------
  // 6. INDIVIDUAL STUDENT GRADE SAVE
  // ---------------------------------------------------------------------------
  const handleSingleSubmit = async (student) => {
    const studentInput = studentGradesInput[student.studentId];
    if (studentInput?.score === '' || studentInput?.score === undefined || Number(studentInput.score) < 0) {
      alert('Please enter a valid score (0 or above) before saving.');
      return;
    }

    setSavingStudentId(student.studentId);
    setMessage({ type: '', text: '' });

    try {
      const docId = `${institutionId}_${student.studentId}_${selectedModuleId}_${semesterId}`;
      const gradeDocRef = doc(GradeAndAttendance, 'exams_grades', docId);
      const payload = buildGradePayload(student);

      await setDoc(gradeDocRef, payload, { merge: true });
      setMessage({ type: 'success', text: `Grade for ${student.fullName || student.studentId} saved successfully!` });
    } catch (err) {
      console.error('Error saving single grade:', err);
      setMessage({ type: 'error', text: 'Failed to save student grade.' });
    } finally {
      setSavingStudentId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // 7. BULK SUBMIT TO FIREBASE
  // ---------------------------------------------------------------------------
  const handleBulkSubmit = async (e) => {
    e.preventDefault();

    if (!institutionId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please log in again.' });
      return;
    }

    if (!selectedModuleId || !semesterId) {
      setMessage({ type: 'error', text: 'Please select a valid term semester and module.' });
      return;
    }

    if (hasEmptyOrInvalidScores) {
      setMessage({ type: 'error', text: 'All student score boxes must have a valid score (0 or above) before publishing.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const batchPromises = classStudents.map(async (student) => {
        const docId = `${institutionId}_${student.studentId}_${selectedModuleId}_${semesterId}`;
        const gradeDocRef = doc(GradeAndAttendance, 'exams_grades', docId);
        const payload = buildGradePayload(student);
        return setDoc(gradeDocRef, payload, { merge: true });
      });

      await Promise.all(batchPromises);
      setMessage({ type: 'success', text: `All exam grades saved and published by ${submitterName}!` });
    } catch (err) {
      console.error('Error uploading grades:', err);
      setMessage({ type: 'error', text: 'Failed to upload grades. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm font-medium text-gray-500 animate-pulse">
          Loading academic session structures and class rosters...
        </p>
      </div>
    );
  }

  const selectedModule = modulesMap.get(selectedModuleId);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 font-sans">
      {/* PAGE HEADER */}
      <div className="border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Upload & Manage Exam Grades 📝</h1>
          <p className="text-sm text-gray-500">
            Linked with Academic Year, Semesters, Programmes, Modules & Staff Submissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ✅ Submitter Badge */}
          <div className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg border border-indigo-200">
            Active User: <span className="font-bold">{submitterName}</span>
          </div>
          <div className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-2 rounded-lg border border-blue-200">
            Inst ID: <span className="font-mono">{institutionId || 'N/A'}</span>
          </div>
        </div>
      </div>

      {message.text && (
        <div
          className={`p-4 rounded-lg text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* CASCADING FILTER CONTROLS */}
      <div className="bg-white p-6 border rounded-xl shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
          1. Select Academic Session, Programme & Module
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Academic Year <span className="text-red-500">*</span>
            </label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full border p-2 rounded text-sm bg-white font-mono font-semibold"
            >
              <option value="">-- Choose Year --</option>
              {availableAcademicYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Semester / Term <span className="text-red-500">*</span>
            </label>
            <select
              value={semesterId}
              onChange={(e) => setSemesterId(e.target.value)}
              className="w-full border p-2 rounded text-sm bg-white font-medium"
            >
              <option value="">-- Choose Semester --</option>
              {filteredSemestersForYear.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.semesterName || sem.code} {sem.status === 'Active' ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Programme <span className="text-red-500">*</span>
            </label>
            <select
              value={programmeId}
              onChange={(e) => setProgrammeId(e.target.value)}
              className="w-full border p-2 rounded text-sm bg-white font-medium"
            >
              <option value="">-- Choose Programme --</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.programmeName} ({p.awardType || 'General'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Study Level <span className="text-red-500">*</span>
            </label>
            <select
              value={studyLevel}
              onChange={(e) => setStudyLevel(e.target.value)}
              className="w-full border p-2 rounded text-sm bg-white font-medium text-blue-900"
            >
              {STUDY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-bold text-gray-800 mb-1">
              Course Module to Grade <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedModuleId}
              onChange={(e) => setSelectedModuleId(e.target.value)}
              className="w-full border p-2.5 rounded text-sm bg-white font-mono font-bold text-blue-800 border-blue-300"
            >
              <option value="">-- Choose Module --</option>
              {availableModulesForSelection.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.moduleCode} — {m.moduleTitle} ({m.creditHours || 3} Credits)
                </option>
              ))}
            </select>
            {availableModulesForSelection.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No modules found allocated for this term and study level. Configure them under Academic Curriculum.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* STUDENT CLASS LIST & GRADE INPUTS */}
      <form onSubmit={handleBulkSubmit} className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
          <div>
            <h2 className="text-base font-bold text-gray-800">
              Enrolled Class List ({classStudents.length} Students)
            </h2>
            <p className="text-xs text-gray-500">
              {selectedModule ? `Grading Module: ${selectedModule.moduleCode} - ${selectedModule.moduleTitle}` : 'Select a module above'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-700 border-b uppercase tracking-wider">
                <th className="p-3 w-12">#</th>
                <th className="p-3">Student Name & ID</th>
                <th className="p-3 w-28">Score (0 - 100)</th>
                <th className="p-3 w-36">Auto Grade</th>
                <th className="p-3 w-28">Grade Point</th>
                <th className="p-3">Remarks</th>
                <th className="p-3 w-32">Submitted By</th>
                <th className="p-3 w-24 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {classStudents.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center p-8 text-gray-400">
                    No students registered under this programme and study level ({studyLevel}).
                  </td>
                </tr>
              ) : (
                classStudents.map((student, idx) => {
                  const studentInput = studentGradesInput[student.studentId] || {
                    score: '',
                    gradeStatus: '',
                    gradePoint: '',
                    remarks: '',
                    submittedBy: submitterName,
                  };

                  const isScoreInvalid = studentInput.score === '' || Number(studentInput.score) < 0 || Number(studentInput.score) > 100;

                  return (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-mono text-gray-400">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-semibold text-gray-900">
                          {student.title} {student.fullName}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">{student.studentId}</div>
                      </td>

                      {/* Score Input */}
                      <td className="p-3">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="e.g. 75"
                          value={studentInput.score}
                          onChange={(e) => handleScoreChange(student.studentId, e.target.value)}
                          className="w-full border p-2 rounded text-sm font-bold font-mono text-blue-900 focus:ring-2 focus:ring-blue-500"
                        />
                      </td>

                      {/* Auto Grade Status Dropdown (Disabled / Read-only) */}
                      <td className="p-3">
                        <select
                          value={studentInput.gradeStatus}
                          disabled={true}
                          className="w-full border p-2 rounded text-sm font-bold bg-slate-100 text-indigo-900 border-slate-300 cursor-not-allowed opacity-90"
                        >
                          <option value="">-- Auto --</option>
                          <option value="A">Grade A</option>
                          <option value="B">Grade B</option>
                          <option value="C">Grade C</option>
                          <option value="D">Grade D</option>
                          <option value="E">Grade E</option>
                          <option value="F">Grade F</option>
                        </select>
                      </td>

                      {/* Grade Point (GPA) Input - Supports .00 decimals */}
                      <td className="p-3">
                        <input
                          type="text"
                          step="0.01"
                          placeholder="-"
                          value={studentInput.gradePoint}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStudentGradesInput((prev) => ({
                              ...prev,
                              [student.studentId]: {
                                ...prev[student.studentId],
                                gradePoint: val,
                              },
                            }));
                          }}
                          className="w-full border p-2 rounded text-sm font-mono font-bold text-emerald-800 bg-emerald-50 border-emerald-300"
                        />
                      </td>

                      {/* Remarks */}
                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="Optional feedback..."
                          value={studentInput.remarks}
                          onChange={(e) => handleRemarkChange(student.studentId, e.target.value)}
                          className="w-full border p-2 rounded text-xs text-gray-700"
                        />
                      </td>

                      {/* Submitted By Column */}
                      <td className="p-3 text-gray-600 font-medium">
                        <span className="inline-block bg-slate-100 text-slate-700 px-2.5 py-1 rounded text-[11px]">
                          {studentInput.submittedBy || submitterName}
                        </span>
                      </td>

                      {/* Individual Upload Action */}
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          disabled={savingStudentId === student.studentId || isScoreInvalid}
                          onClick={() => handleSingleSubmit(student)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[10px] uppercase tracking-wider px-3 py-2 rounded shadow-sm disabled:opacity-40 transition-colors"
                        >
                          {savingStudentId === student.studentId ? 'Saving...' : 'Upload'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {classStudents.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-xs text-gray-500">
              {hasEmptyOrInvalidScores ? '⚠️ Please enter valid scores (0-100) for all students to enable bulk saving.' : '✅ All student scores are valid.'}
            </p>
            <button
              type="submit"
              disabled={submitting || !selectedModuleId || hasEmptyOrInvalidScores}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs uppercase tracking-wider px-8 py-3 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving All Grades...' : 'Save & Publish All Grades'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}