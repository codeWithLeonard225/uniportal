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

export default function LecturerUploadGradesPage({ staffProfile }) {
  const { user } = useAuth();

  // ---------------------------------------------------------------------------
  // 1. AUTHENTICATION & INSTITUTION RESOLUTION
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

  const authData = user?.data || user || {};

  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    localUserData?.institutionID ||
    localUserData?.schoolId ||
    '';

  const loggedInDocId = staffProfile?.id || '';
  const loggedInStaffId =
    staffProfile?.staffId ||
    staffProfile?.staffID ||
    authData?.staffId ||
    authData?.staffID ||
    user?.staffId ||
    user?.staffID ||
    '';

  const loggedInEmail =
    staffProfile?.email ||
    authData?.email ||
    user?.email ||
    localUserData?.data?.email ||
    '';

  const submitterName =
   staffProfile?.fullName ||
    authData?.fullName ||
    authData?.adminName ||
    user?.displayName ||
    'Academic Staff';

  // ---------------------------------------------------------------------------
  // 2. STATE STORES
  // ---------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Reference Master Data
  const [semesters, setSemesters] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [allModules, setAllModules] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [gradingScales, setGradingScales] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [existingGrades, setExistingGrades] = useState({});

  // Cascading Selection Filters
  const [academicYear, setAcademicYear] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('');
  const [selectedStudyLevel, setSelectedStudyLevel] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');

  // Grade inputs mapping: { [studentId]: { score, gradeStatus, gradePoint, remarks } }
  const [studentGradesInput, setStudentGradesInput] = useState({});

  // ---------------------------------------------------------------------------
  // 3. FETCH REFERENCE DATA & ALLOCATIONS FOR THE LOGGED-IN LECTURER
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentInstitutionId) {
      setLoading(false);
      return;
    }

    let unsubAllocations;
    let unsubGrades;

    const loadData = async () => {
      setLoading(true);
      try {
        const [semSnap, progSnap, modSnap, progModSnap, scaleSnap, studSnap] =
          await Promise.all([
            getDocs(query(collection(db, 'semesters'), where('institutionId', '==', currentInstitutionId))),
            getDocs(query(collection(db, 'programmes'), where('institutionId', '==', currentInstitutionId))),
            getDocs(query(collection(db, 'modules'), where('institutionId', '==', currentInstitutionId))),
            getDocs(query(collection(db, 'programme_modules'), where('institutionId', '==', currentInstitutionId))),
            getDocs(query(collection(GradeAndAttendance, 'grading_scales'), where('institutionID', '==', currentInstitutionId))),
            getDocs(query(collection(db, 'students'), where('institutionID', '==', currentInstitutionId))),
          ]);

        const loadedSemesters = semSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedProgrammes = progSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const rawModules = [
          ...modSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...progModSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ];
        const uniqueModules = Array.from(new Map(rawModules.map((m) => [m.id, m])).values());
        const loadedScales = scaleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        loadedScales.sort((a, b) => b.minScore - a.minScore);

        setSemesters(loadedSemesters);
        setProgrammes(loadedProgrammes);
        setAllModules(uniqueModules);
        setGradingScales(loadedScales);
        setStudentsList(studSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        if (loadedSemesters.length > 0) {
          const activeSem = loadedSemesters.find((s) => s.status === 'Active') || loadedSemesters[0];
          setAcademicYear(activeSem.academicYear || '');
          setSemesterId(activeSem.id);
        }

        // Subscribe to Lecturer Allocations
        const qAlloc = query(collection(db, 'lecturer_module_allocations'), where('institutionId', '==', currentInstitutionId));
        unsubAllocations = onSnapshot(qAlloc, (snapshot) => {
          const allAlloc = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          const myAllocations = allAlloc.filter((alloc) => {
            const matchesLecturerId = loggedInDocId && alloc.lecturerId === loggedInDocId;
            const matchesStaffId = loggedInStaffId && (alloc.staffId === loggedInStaffId || alloc.lecturerId === loggedInStaffId);
            const matchesEmail = loggedInEmail && alloc.email?.toLowerCase() === loggedInEmail.toLowerCase();
            return matchesLecturerId || matchesStaffId || matchesEmail;
          });
          setAllocations(myAllocations);
        });

        // Subscribe to Existing Exams Grades
        const qGrades = query(collection(GradeAndAttendance, 'exams_grades'), where('institutionID', '==', currentInstitutionId));
        unsubGrades = onSnapshot(qGrades, (snapshot) => {
          const gradeMap = {};
          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const key = `${data.studentId}_${data.moduleId}_${data.semesterId || ''}`;
            gradeMap[key] = { id: docSnap.id, ...data };
          });
          setExistingGrades(gradeMap);
        });

      } catch (err) {
        console.error('Error loading grade portal data:', err);
        setMessage({ type: 'error', text: 'Failed to load required academic reference records.' });
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubAllocations) unsubAllocations();
      if (unsubGrades) unsubGrades();
    };
  }, [currentInstitutionId, loggedInDocId, loggedInStaffId, loggedInEmail]);

  // ---------------------------------------------------------------------------
  // 4. LOOKUPS & CASCADING DROPDOWNS BASED ON ALLOCATIONS
  // ---------------------------------------------------------------------------
  const programmeMap = useMemo(() => new Map(programmes.map((p) => [p.id, p])), [programmes]);
  const modulesMap = useMemo(() => new Map(allModules.map((m) => [m.id, m])), [allModules]);
  const semesterMap = useMemo(() => new Map(semesters.map((s) => [s.id, s])), [semesters]);

  // Available Programmes assigned to this lecturer
  const availableProgrammes = useMemo(() => {
    const progIds = new Set(allocations.map((a) => a.programmeId).filter(Boolean));
    return programmes.filter((p) => progIds.has(p.id));
  }, [allocations, programmes]);

  useEffect(() => {
    if (availableProgrammes.length > 0 && !availableProgrammes.some((p) => p.id === selectedProgrammeId)) {
      setSelectedProgrammeId(availableProgrammes[0].id);
    }
  }, [availableProgrammes, selectedProgrammeId]);

  // Available Study Levels for selected Programme
  const availableStudyLevels = useMemo(() => {
    if (!selectedProgrammeId) return [];
    const levels = new Set(
      allocations
        .filter((a) => a.programmeId === selectedProgrammeId)
        .map((a) => a.studyLevel)
        .filter(Boolean)
    );
    return Array.from(levels);
  }, [allocations, selectedProgrammeId]);

  useEffect(() => {
    if (availableStudyLevels.length > 0 && !availableStudyLevels.includes(selectedStudyLevel)) {
      setSelectedStudyLevel(availableStudyLevels[0]);
    } else if (availableStudyLevels.length === 0) {
      setSelectedStudyLevel('');
    }
  }, [availableStudyLevels, selectedStudyLevel]);

  // Available Modules for selected Programme & Study Level from Allocations
  const availableModules = useMemo(() => {
    if (!selectedProgrammeId || !selectedStudyLevel) return [];
    const matchedAllocations = allocations.filter(
      (a) => a.programmeId === selectedProgrammeId && a.studyLevel === selectedStudyLevel
    );

    const modIds = new Set();
    matchedAllocations.forEach((a) => {
      if (Array.isArray(a.moduleIds)) {
        a.moduleIds.forEach((id) => modIds.add(id));
      }
    });

    return Array.from(modIds).map((id) => modulesMap.get(id)).filter(Boolean);
  }, [allocations, selectedProgrammeId, selectedStudyLevel, modulesMap]);

  useEffect(() => {
    if (availableModules.length > 0 && !availableModules.some((m) => m.id === selectedModuleId)) {
      setSelectedModuleId(availableModules[0].id);
    } else if (availableModules.length === 0) {
      setSelectedModuleId('');
    }
  }, [availableModules, selectedModuleId]);

  // Enrolled Class Students matching Programme & Study Level
  const classStudents = useMemo(() => {
    if (!selectedProgrammeId || !selectedStudyLevel) return [];
    return studentsList.filter(
      (s) =>
        (s.programmeId === selectedProgrammeId || s.programme === selectedProgrammeId) &&
        s.studyLevel === selectedStudyLevel
    );
  }, [studentsList, selectedProgrammeId, selectedStudyLevel]);

  // Initialize input state when students or selected module/semester change
  useEffect(() => {
    const inputs = {};
    classStudents.forEach((student) => {
      const key = `${student.studentId}_${selectedModuleId}_${semesterId}`;
      const existing = existingGrades[key];
      const gp = existing?.gradePoint !== undefined && existing?.gradePoint !== null ? Number(existing.gradePoint).toFixed(2) : '';

      inputs[student.studentId] = {
        score: existing?.score !== undefined && existing?.score !== null ? existing.score : '',
        gradeStatus: existing?.gradeStatus || '',
        gradePoint: gp,
        remarks: existing?.remarks || '',
        submittedBy: existing?.submittedBy || submitterName,
      };
    });
    setStudentGradesInput(inputs);
  }, [classStudents, selectedModuleId, semesterId, existingGrades, submitterName]);

  // ---------------------------------------------------------------------------
  // 5. GRADE & GPA CALCULATION
  // ---------------------------------------------------------------------------
  const evaluateGradeDetails = (numericScore) => {
    if (numericScore === '' || numericScore === null || isNaN(numericScore)) {
      return { grade: '', gradePoint: '' };
    }
    const score = Number(numericScore);
    for (const scale of gradingScales) {
      if (score >= scale.minScore && score <= scale.maxScore) {
        const gp = scale.gradePoint !== undefined && scale.gradePoint !== null ? Number(scale.gradePoint).toFixed(2) : '';
        return { grade: scale.grade, gradePoint: gp };
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

  const handleRemarkChange = (studentId, remarksValue) => {
    setStudentGradesInput((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks: remarksValue,
        submittedBy: submitterName,
      },
    }));
  };

  const hasEmptyOrInvalidScores = useMemo(() => {
    if (classStudents.length === 0) return true;
    return classStudents.some((student) => {
      const scoreVal = studentGradesInput[student.studentId]?.score;
      if (scoreVal === '' || scoreVal === undefined || scoreVal === null) return true;
      const num = Number(scoreVal);
      return isNaN(num) || num < 0 || num > 100;
    });
  }, [classStudents, studentGradesInput]);

  const buildPayload = (student) => {
    const studentInput = studentGradesInput[student.studentId] || {};
    const currentProg = programmeMap.get(selectedProgrammeId);
    const currentMod = modulesMap.get(selectedModuleId);
    const currentSem = semesterMap.get(semesterId);
    const scoreNum = studentInput.score !== '' && !isNaN(studentInput.score) ? Number(studentInput.score) : 0;

    return {
      institutionID: currentInstitutionId,
      studentId: student.studentId,
      studentName: student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      programmeId: selectedProgrammeId,
      programmeName: currentProg?.programmeName || currentProg?.name || '',
      studyLevel: selectedStudyLevel,
      moduleId: selectedModuleId,
      courseCode: currentMod?.moduleCode || currentMod?.code || 'MOD',
      courseTitle: currentMod?.moduleTitle || currentMod?.title || 'Module',
      academicYear: academicYear,
      semesterId: semesterId,
      semesterName: currentSem?.semesterName || currentSem?.code || 'Semester',
      score: scoreNum,
      gradeStatus: studentInput.gradeStatus,
      gradePoint: studentInput.gradePoint !== '' ? Number(studentInput.gradePoint) : 0,
      remarks: studentInput.remarks || '',
      submittedBy: submitterName,
      submittedByEmail: loggedInEmail,
      submittedById: loggedInDocId || loggedInStaffId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
  };

  // ---------------------------------------------------------------------------
  // 6. SAVE HANDLERS (Single & Bulk)
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
      const docId = `${currentInstitutionId}_${student.studentId}_${selectedModuleId}_${semesterId}`;
      const gradeRef = doc(GradeAndAttendance, 'exams_grades', docId);
      const payload = buildPayload(student);

      await setDoc(gradeRef, payload, { merge: true });
      setMessage({ type: 'success', text: `Grade for ${student.fullName || student.studentId} saved successfully!` });
    } catch (err) {
      console.error('Error saving grade:', err);
      setMessage({ type: 'error', text: 'Failed to save student grade.' });
    } finally {
      setSavingStudentId(null);
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!selectedModuleId || !semesterId) {
      setMessage({ type: 'error', text: 'Please select a valid semester and module.' });
      return;
    }
    if (hasEmptyOrInvalidScores) {
      setMessage({ type: 'error', text: 'All student score boxes must have a valid score (0-100) before publishing.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const batchPromises = classStudents.map(async (student) => {
        const docId = `${currentInstitutionId}_${student.studentId}_${selectedModuleId}_${semesterId}`;
        const gradeRef = doc(GradeAndAttendance, 'exams_grades', docId);
        const payload = buildPayload(student);
        return setDoc(gradeRef, payload, { merge: true });
      });

      await Promise.all(batchPromises);
      setMessage({ type: 'success', text: `All class exam grades successfully saved and published by ${submitterName}!` });
    } catch (err) {
      console.error('Error saving bulk grades:', err);
      setMessage({ type: 'error', text: 'Failed to publish bulk grades. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 7. ACCESS CONTROL & RENDER GUARDS
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="p-16 text-center">
        <p className="text-sm font-medium text-slate-500 animate-pulse">
          Authenticating lecturer profile and loading teaching assignments...
        </p>
      </div>
    );
  }

  if (!currentInstitutionId) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 bg-white border border-red-100 rounded-3xl shadow-sm text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl mx-auto flex items-center justify-center text-2xl font-bold">
          🔒
        </div>
        <h2 className="text-lg font-bold text-slate-800">Access Restricted</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          You must be logged in with a valid staff account and institution session to access the grade upload portal.
        </p>
      </div>
    );
  }

  const selectedModule = modulesMap.get(selectedModuleId);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 font-sans">
      {/* PAGE HEADER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Lecturer Grade Entry Portal 📝</h1>
          <p className="text-xs text-slate-500 mt-1">
            Upload and manage exam scores for your assigned teaching modules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl border border-indigo-200">
            Instructor: <span className="font-bold">{submitterName}</span>
          </div>
          <div className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-2 rounded-xl border border-blue-200">
            Inst ID: <span className="font-mono">{currentInstitutionId}</span>
          </div>
        </div>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl text-xs font-medium border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* ALLOCATION FILTER CONTROLS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2">
          1. Select Assigned Teaching Module & Class
        </h2>

        {allocations.length === 0 ? (
          <div className="p-8 text-center bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium">
            ⚠️ You currently have no module teaching allocations assigned to your profile. Please contact your administrator.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Academic Year</label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-mono font-bold text-slate-800"
              >
                {semesters.map((sem) => (
                  <option key={sem.id} value={sem.academicYear}>{sem.academicYear}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Semester / Term</label>
              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-bold text-slate-800"
              >
                {semesters.map((sem) => (
                  <option key={sem.id} value={sem.id}>
                    {sem.semesterName || sem.code} {sem.status === 'Active' ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Allocated Programme</label>
              <select
                value={selectedProgrammeId}
                onChange={(e) => setSelectedProgrammeId(e.target.value)}
                className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-bold text-indigo-900"
              >
                <option value="">-- Choose Programme --</option>
                {availableProgrammes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.programmeName || p.title || p.name} ({p.awardType || 'General'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Study Level</label>
              <select
                value={selectedStudyLevel}
                onChange={(e) => setSelectedStudyLevel(e.target.value)}
                className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-bold text-emerald-700"
              >
                <option value="">-- Choose Level --</option>
                {availableStudyLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">Target Assigned Module</label>
              <select
                value={selectedModuleId}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                className="w-full border border-slate-300 p-3 rounded-xl text-xs bg-white font-mono font-bold text-indigo-700 shadow-sm"
              >
                <option value="">-- Choose Module --</option>
                {availableModules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.moduleCode || m.code} — {m.moduleTitle || m.title} ({m.creditHours || 3} Credits)
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* STUDENT CLASS LIST & GRADING TABLE */}
      {allocations.length > 0 && selectedModuleId && (
        <form onSubmit={handleBulkSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Enrolled Students Roster ({classStudents.length} Students)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedModule ? `Module: ${selectedModule.moduleCode || selectedModule.code} - ${selectedModule.moduleTitle || selectedModule.title}` : ''}
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || classStudents.length === 0 || hasEmptyOrInvalidScores}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-xl shadow-sm disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Publishing...' : 'Save & Publish All Grades'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b uppercase tracking-wider text-[10px]">
                  <th className="p-3 w-12">#</th>
                  <th className="p-3">Student Name & ID</th>
                  <th className="p-3 w-28">Score (0-100)</th>
                  <th className="p-3 w-36">Auto Grade</th>
                  <th className="p-3 w-28">Grade Point</th>
                  <th className="p-3">Remarks</th>
                  <th className="p-3 w-32">Submitted By</th>
                  <th className="p-3 w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center p-8 text-slate-400 italic">
                      No active students found registered under this programme and study level ({selectedStudyLevel}).
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

                    const isScoreInvalid =
                      studentInput.score === '' || Number(studentInput.score) < 0 || Number(studentInput.score) > 100;

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">
                            {student.title ? `${student.title} ` : ''}{student.fullName || `${student.firstName || ''} ${student.lastName || ''}`}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">{student.studentId}</div>
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
                            className="w-full border border-slate-200 p-2 rounded-xl text-sm font-bold font-mono text-blue-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </td>

                        {/* Readonly Auto Grade */}
                        <td className="p-3">
                          <select
                            value={studentInput.gradeStatus}
                            disabled={true}
                            className="w-full border border-slate-200 p-2 rounded-xl text-sm font-bold bg-slate-100 text-indigo-900 cursor-not-allowed"
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

                        {/* Grade Point */}
                        <td className="p-3">
                          <input
                            type="text"
                            value={studentInput.gradePoint}
                            readOnly
                            placeholder="-"
                            className="w-full border border-slate-200 p-2 rounded-xl text-sm font-mono font-bold text-emerald-800 bg-emerald-50/50 cursor-not-allowed"
                          />
                        </td>

                        {/* Remarks */}
                        <td className="p-3">
                          <input
                            type="text"
                            placeholder="Optional feedback..."
                            value={studentInput.remarks}
                            onChange={(e) => handleRemarkChange(student.studentId, e.target.value)}
                            className="w-full border border-slate-200 p-2 rounded-xl text-xs text-slate-700 bg-white"
                          />
                        </td>

                        {/* Submitted By */}
                        <td className="p-3">
                          <span className="inline-block bg-slate-100 text-slate-700 px-2 py-1 rounded-lg text-[10px] font-medium">
                            {studentInput.submittedBy || submitterName}
                          </span>
                        </td>

                        {/* Individual Upload Button */}
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            disabled={savingStudentId === student.studentId || isScoreInvalid}
                            onClick={() => handleSingleSubmit(student)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl shadow-sm disabled:opacity-40 transition-colors"
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
            <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-100 gap-3">
              <p className="text-xs text-slate-500 font-medium">
                {hasEmptyOrInvalidScores ? '⚠️ Enter valid numeric scores (0-100) for all students to enable bulk publishing.' : '✅ All student scores are valid and ready.'}
              </p>
              <button
                type="submit"
                disabled={submitting || !selectedModuleId || hasEmptyOrInvalidScores}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider px-8 py-3 rounded-xl shadow-sm disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Publishing Grades...' : 'Save & Publish All Grades'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}