'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { GradeAndAttendance } from '@/app/lib/gradeAttendanceFirebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

const STUDY_LEVELS = [
  'All Levels',
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'Postgraduate / Masters',
];

export default function AdminStudentResultsPage({ staffProfile }) {
  const { user } = useAuth();

  // ---------------------------------------------------------------------------
  // 1. RESOLVE INSTITUTION & AUTH CONTEXT
  // ---------------------------------------------------------------------------
  const [localUserData, setLocalUserData] = useState(null);

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem('user') ||
        localStorage.getItem('authUser') ||
        localStorage.getItem('session');
      if (stored) setLocalUserData(JSON.parse(stored));
    } catch (e) {
      console.error('Error loading session from localStorage:', e);
    }
  }, []);

  const institutionId =
    staffProfile?.institutionID ||
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    localUserData?.institutionID ||
    localUserData?.schoolId ||
    '';

  // ---------------------------------------------------------------------------
  // 2. MASTER DATA STORES & FILTERS
  // ---------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [students, setStudents] = useState([]);
  const [allModules, setAllModules] = useState([]);
  const [allOfferings, setAllOfferings] = useState([]);
  const [allGrades, setAllGrades] = useState([]);
  const [gradingScales, setGradingScales] = useState([]);

  // Filters
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedSemesterId, setSelectedSemesterId] = useState('');
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('');
  const [selectedStudyLevel, setSelectedStudyLevel] = useState('All Levels');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Student Modal Transcript View State
  const [activeStudentModal, setActiveStudentModal] = useState(null);

  // ---------------------------------------------------------------------------
  // 3. FETCH BASELINE DATA & LISTEN TO GRADES & SCALES
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!institutionId || institutionId === 'N/A') {
      setLoading(false);
      return;
    }

    let unsubGrades;
    let unsubScales;

    const fetchBaseData = async () => {
      setLoading(true);
      try {
        const [semSnap, progSnap, studSnap, modSnap, offSnap, scaleSnap] = await Promise.all([
          getDocs(query(collection(db, 'semesters'), where('institutionId', '==', institutionId))),
          getDocs(query(collection(db, 'programmes'), where('institutionId', '==', institutionId))),
          getDocs(query(collection(db, 'students'), where('institutionID', '==', institutionId))),
          getDocs(query(collection(db, 'programme_modules'), where('institutionId', '==', institutionId))),
          getDocs(query(collection(db, 'programme_module_offerings'), where('institutionId', '==', institutionId))),
          getDocs(query(collection(GradeAndAttendance, 'grading_scales'), where('institutionID', '==', institutionId))),
        ]);

        const loadedSems = semSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedProgs = progSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedStuds = studSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedMods = modSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedOffs = offSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedScales = scaleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setSemesters(loadedSems);
        setProgrammes(loadedProgs);
        setStudents(loadedStuds);
        setAllModules(loadedMods);
        setAllOfferings(loadedOffs);
        setGradingScales(loadedScales);

        if (loadedSems.length > 0) {
          const active = loadedSems.find((s) => s.status === 'Active') || loadedSems[0];
          setSelectedAcademicYear(active.academicYear || '');
          setSelectedSemesterId(active.id);
        }

        // Subscribe in real-time to all grades for this institution
        const qGrades = query(
          collection(GradeAndAttendance, 'exams_grades'),
          where('institutionID', '==', institutionId)
        );

        unsubGrades = onSnapshot(qGrades, (snapshot) => {
          const grades = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          setAllGrades(grades);
        });

        // Subscribe in real-time to grading scales
        const qScales = query(
          collection(GradeAndAttendance, 'grading_scales'),
          where('institutionID', '==', institutionId)
        );

        unsubScales = onSnapshot(qScales, (snapshot) => {
          const scales = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          setGradingScales(scales);
        });

      } catch (err) {
        console.error('Error fetching admin results baseline data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBaseData();

    return () => {
      if (unsubGrades) unsubGrades();
      if (unsubScales) unsubScales();
    };
  }, [institutionId]);

  // ---------------------------------------------------------------------------
  // 4. LOOKUPS & COMPUTED DATA
  // ---------------------------------------------------------------------------
  const programmeMap = useMemo(() => new Map(programmes.map((p) => [p.id, p])), [programmes]);
  const modulesMap = useMemo(() => new Map(allModules.map((m) => [m.id, m])), [allModules]);

  // Map grade letter to grading scale description
  const gradeDescriptionMap = useMemo(() => {
    const map = new Map();
    gradingScales.forEach((scale) => {
      if (scale.grade && scale.description) {
        map.set(scale.grade.toUpperCase().trim(), scale.description);
      }
    });
    return map;
  }, [gradingScales]);

  const academicYearsList = useMemo(() => {
    const yrs = semesters.map((s) => s.academicYear).filter(Boolean);
    return Array.from(new Set(yrs));
  }, [semesters]);

  const filteredSemesters = useMemo(() => {
    if (!selectedAcademicYear) return semesters;
    return semesters.filter((s) => s.academicYear === selectedAcademicYear);
  }, [semesters, selectedAcademicYear]);

  // Retrieve expected module objects for a student
  const getExpectedModulesForStudent = (progId, level, semId) => {
    if (!progId || !level) return [];
    const offering = allOfferings.find(
      (o) =>
        o.programmeId === progId &&
        (!semId || o.semesterId === semId) &&
        o.studyLevel === level
    );
    if (offering && Array.isArray(offering.moduleIds)) {
      return offering.moduleIds.map((id) => modulesMap.get(id)).filter(Boolean);
    }

    return allModules.filter(
      (m) =>
        (m.programmeId === progId || m.programme === progId) &&
        (!m.studyLevel || m.studyLevel === level)
    );
  };

  // Group raw grades by Student ID to aggregate GPA, grade counts, and missing modules
  const studentResultSummaries = useMemo(() => {
    const studentMap = new Map();

    // Initialize all active students first (subject to programme filter)
    students.forEach((s) => {
      const progId = s.programmeId || s.programme;

      // ✅ If a specific programme is selected, strictly ignore students from other programmes
      if (selectedProgrammeId && progId !== selectedProgrammeId) {
        return;
      }

      const level = s.studyLevel || 'Year 1';
      const progObj = programmeMap.get(progId);
      const progName = progObj?.programmeName || progObj?.title || progObj?.name || 'General Programme';
      const awardType = progObj?.awardType || progObj?.award || 'General';

      studentMap.set(s.studentId || s.id, {
        studentId: s.studentId || s.id,
        fullName: s.fullName || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        programmeId: progId,
        programmeName: progName,
        awardType: awardType,
        studyLevel: level,
        grades: [],
      });
    });

    // Populate grades matching selected filters
    allGrades.forEach((g) => {
      if (selectedSemesterId && g.semesterId !== selectedSemesterId) return;
      if (selectedProgrammeId && g.programmeId !== selectedProgrammeId) return;
      if (selectedStudyLevel !== 'All Levels' && g.studyLevel !== selectedStudyLevel) return;

      const existing = studentMap.get(g.studentId);
      if (existing) {
        existing.grades.push(g);
      } else if (!selectedProgrammeId || g.programmeId === selectedProgrammeId) {
        // Fallback for students recorded in grades but not in students collection
        const progObj = programmeMap.get(g.programmeId);
        const progName = progObj?.programmeName || progObj?.title || progObj?.name || g.programmeName || 'General Programme';
        const awardType = progObj?.awardType || progObj?.award || 'General';

        studentMap.set(g.studentId, {
          studentId: g.studentId,
          fullName: g.studentName || 'Student',
          programmeId: g.programmeId,
          programmeName: progName,
          awardType: awardType,
          studyLevel: g.studyLevel || 'Year 1',
          grades: [g],
        });
      }
    });

    // Calculate GPA, grade counts (A, B, C, D, E, F), and missing modules (M) per student
    const resultList = Array.from(studentMap.values()).map((st) => {
      let totalPoints = 0;
      let totalCredits = 0;

      const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };

      st.grades.forEach((g) => {
        const gp = Number(g.gradePoint) || 0;
        const credits = Number(g.creditHours || g.credits || 3);
        totalPoints += gp * credits;
        totalCredits += credits;

        const letter = (g.gradeStatus || '').toUpperCase().trim();
        if (counts[letter] !== undefined) {
          counts[letter]++;
        }
      });

      const calculatedGPA = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00';
      const expectedMods = getExpectedModulesForStudent(st.programmeId, st.studyLevel, selectedSemesterId);
      const expectedCount = expectedMods.length;
      const gradedCount = st.grades.length;
      const missingCount = expectedCount > gradedCount ? expectedCount - gradedCount : 0;

      return {
        ...st,
        gpa: calculatedGPA,
        totalCredits,
        totalModulesGraded: gradedCount,
        expectedModulesCount: expectedCount,
        expectedModulesList: expectedMods,
        missingModules: missingCount,
        gradeCounts: counts,
      };
    });

    // Apply Search Filter (Student Name or Student ID)
    const search = searchQuery.toLowerCase().trim();
    if (!search) return resultList;

    return resultList.filter(
      (s) =>
        s.fullName.toLowerCase().includes(search) ||
        s.studentId.toLowerCase().includes(search)
    );
  }, [students, allGrades, selectedSemesterId, selectedProgrammeId, selectedStudyLevel, searchQuery, programmeMap, allModules, allOfferings]);

  // Helper to compile full list for the student result slip modal (including 'M' mapped as 'F')
  const getCompleteTranscriptGrades = (studentSummary) => {
    const gradedMap = new Map();
    studentSummary.grades.forEach((g) => {
      const mId = g.moduleId || g.courseCode;
      if (mId) gradedMap.set(mId, g);
    });

    const expectedMods = studentSummary.expectedModulesList || [];
    if (expectedMods.length === 0) {
      return studentSummary.grades.map((g) => {
        const gradeLetter = (g.gradeStatus || '').toUpperCase().trim();
        const mappedDescription = gradeDescriptionMap.get(gradeLetter) || g.remarks || 'Pass';
        return { ...g, remarks: mappedDescription };
      });
    }

    return expectedMods.map((mod) => {
      const existingGrade = gradedMap.get(mod.id) || gradedMap.get(mod.moduleCode);
      if (existingGrade) {
        const gradeLetter = (existingGrade.gradeStatus || '').toUpperCase().trim();
        const mappedDescription = gradeDescriptionMap.get(gradeLetter) || existingGrade.remarks || 'Pass';
        return { ...existingGrade, remarks: mappedDescription };
      }

      // Missing grade mapped as F for the result slip, using grading scale description if available
      const failDescription = gradeDescriptionMap.get('F') || 'Missing / Incomplete Grade';
      return {
        id: `missing_${mod.id}`,
        courseCode: mod.moduleCode || mod.code || 'MOD',
        courseTitle: mod.moduleTitle || mod.title || 'Module',
        score: 0,
        gradeStatus: 'F',
        gradePoint: 0.00,
        remarks: failDescription,
      };
    });
  };

  const handlePrintModal = () => {
    window.print();
  };

  // ---------------------------------------------------------------------------
  // 5. RENDER UI & ACCESS GUARD
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="p-16 text-center">
        <p className="text-sm font-medium text-slate-500 animate-pulse">
          Loading institutional exam results and student records...
        </p>
      </div>
    );
  }

  if (!institutionId || institutionId === 'N/A') {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 bg-white border border-red-100 rounded-3xl shadow-sm text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl mx-auto flex items-center justify-center text-2xl font-bold">
          🔒
        </div>
        <h2 className="text-lg font-bold text-slate-800">Admin Portal Restricted</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Unable to resolve institution ID. Please ensure you are logged in with administrative access.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 font-sans print:p-0 print:max-w-none">
      {/* PAGE HEADER (Hidden on Print) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Student Examination Results & Transcripts 📊</h1>
          <p className="text-xs text-slate-500 mt-1">
            Institutional overview of student academic performance, grade breakdowns, and GPA records.
          </p>
        </div>

        <div className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-2 rounded-xl border border-blue-200 font-mono">
          Inst ID: {institutionId}
        </div>
      </div>

      {/* FILTER CONTROLS (Hidden on Print) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4 print:hidden">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2">
          Filter Student Results
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Academic Year</label>
            <select
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-mono font-bold text-slate-800"
            >
              <option value="">-- All Years --</option>
              {academicYearsList.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Semester / Term</label>
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-bold text-slate-800"
            >
              <option value="">-- All Semesters --</option>
              {filteredSemesters.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.semesterName || sem.code} {sem.status === 'Active' ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Programme</label>
            <select
              value={selectedProgrammeId}
              onChange={(e) => setSelectedProgrammeId(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-bold text-indigo-900"
            >
              <option value="">-- All Programmes --</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.programmeName || p.title || p.name} {p.awardType ? `(${p.awardType})` : ''}
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
              {STUDY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Search Roster</label>
            <input
              type="text"
              placeholder="Search Name or Student ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* RESULTS DIRECTORY TABLE (Hidden on Print) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 print:hidden">
        <div className="flex justify-between items-center border-b pb-4">
          <h2 className="text-base font-bold text-slate-800">
            Student Performance Directory ({studentResultSummaries.length} Records)
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">
            * <strong className="text-slate-600">M</strong> indicates Missing / Unpublished Grade
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b uppercase tracking-wider text-[10px]">
                <th className="p-3 w-10">#</th>
                <th className="p-3">Student Name & ID</th>
                <th className="p-3">Study Level, Programme & Award</th>
                <th className="p-3 text-center">Modules (Graded / Expected)</th>
                <th className="p-3 text-center" title="Grade A Count">A</th>
                <th className="p-3 text-center" title="Grade B Count">B</th>
                <th className="p-3 text-center" title="Grade C Count">C</th>
                <th className="p-3 text-center" title="Grade D Count">D</th>
                <th className="p-3 text-center" title="Grade E Count">E</th>
                <th className="p-3 text-center" title="Grade F Count">F</th>
                <th className="p-3 text-center text-amber-600" title="Missing Grade Count">M</th>
                <th className="p-3 text-center">Semester GPA</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentResultSummaries.length === 0 ? (
                <tr>
                  <td colSpan="13" className="text-center p-12 text-slate-400 italic">
                    No student results found matching your active filter criteria.
                  </td>
                </tr>
              ) : (
                studentResultSummaries.map((st, idx) => (
                  <tr key={st.studentId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                    
                    {/* Student Name & ID */}
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{st.fullName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{st.studentId}</div>
                    </td>

                    {/* Study Level, Programme & Award Type */}
                    <td className="p-3">
                      <div className="font-bold text-slate-800">
                        {st.studyLevel} <span className="text-indigo-600 font-semibold font-mono">[{st.awardType}]</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[200px]">{st.programmeName}</div>
                    </td>

                    {/* Modules (Graded / Expected) */}
                    <td className="p-3 text-center font-mono font-bold text-slate-700">
                      <span className="text-indigo-600">{st.totalModulesGraded}</span>
                      <span className="text-slate-400 font-normal"> / {st.expectedModulesCount || '—'}</span>
                    </td>

                    {/* Grade A */}
                    <td className="p-3 text-center font-mono font-bold text-emerald-700">
                      {st.gradeCounts.A > 0 ? st.gradeCounts.A : <span className="text-slate-300">0</span>}
                    </td>

                    {/* Grade B */}
                    <td className="p-3 text-center font-mono font-bold text-blue-700">
                      {st.gradeCounts.B > 0 ? st.gradeCounts.B : <span className="text-slate-300">0</span>}
                    </td>

                    {/* Grade C */}
                    <td className="p-3 text-center font-mono font-bold text-slate-700">
                      {st.gradeCounts.C > 0 ? st.gradeCounts.C : <span className="text-slate-300">0</span>}
                    </td>

                    {/* Grade D */}
                    <td className="p-3 text-center font-mono font-bold text-amber-700">
                      {st.gradeCounts.D > 0 ? st.gradeCounts.D : <span className="text-slate-300">0</span>}
                    </td>

                    {/* Grade E */}
                    <td className="p-3 text-center font-mono font-bold text-orange-600">
                      {st.gradeCounts.E > 0 ? st.gradeCounts.E : <span className="text-slate-300">0</span>}
                    </td>

                    {/* Grade F */}
                    <td className="p-3 text-center font-mono font-bold text-red-600">
                      {st.gradeCounts.F > 0 ? st.gradeCounts.F : <span className="text-slate-300">0</span>}
                    </td>

                    {/* Missing Grade (M) */}
                    <td className="p-3 text-center font-mono font-bold text-amber-600 bg-amber-50/50">
                      {st.missingModules > 0 ? st.missingModules : <span className="text-slate-300">0</span>}
                    </td>

                    {/* Semester GPA */}
                    <td className="p-3 text-center">
                      <span className="inline-block px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-bold font-mono text-xs border border-emerald-200">
                        {st.gpa} GPA
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setActiveStudentModal(st)}
                        disabled={st.totalModulesGraded === 0 && st.expectedModulesCount === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl shadow-sm disabled:opacity-40 transition-colors"
                      >
                        View Slip
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OFFICIAL TRANSCRIPT / RESULT SLIP MODAL (Viewable & Printable) */}
      {activeStudentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto print:p-0 print:static print:bg-transparent">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-8 space-y-6 relative shadow-2xl print:shadow-none print:p-0 print:w-full">
            {/* Modal Actions (Hidden on Print) */}
            <div className="flex justify-end gap-3 print:hidden">
              <button
                onClick={handlePrintModal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-sm transition-colors"
              >
                🖨️ Print Result Slip
              </button>
              <button
                onClick={() => setActiveStudentModal(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>

            {/* Official Slip Content */}
            <div className="border-b border-slate-100 pb-6 text-center space-y-2">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-wide">
                Official Student Academic Result Slip
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Institution ID: <span className="font-mono">{institutionId}</span>
              </p>
            </div>

            {/* Student Details Header */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Student Name</span>
                <span className="text-sm font-bold text-slate-900">{activeStudentModal.fullName}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Student ID</span>
                <span className="text-sm font-mono font-bold text-indigo-600">{activeStudentModal.studentId}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Programme & Award Type</span>
                <span className="text-sm font-bold text-emerald-600">
                  {activeStudentModal.programmeName} <span className="text-indigo-700 font-mono font-extrabold">[{activeStudentModal.awardType}]</span>
                </span>
                <span className="text-[11px] block font-semibold text-slate-500 mt-0.5">Study Level: {activeStudentModal.studyLevel}</span>
              </div>
            </div>

            {/* Student Course Grades Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b uppercase text-[10px] tracking-wider">
                    <th className="p-3 w-12">#</th>
                    <th className="p-3">Course Code</th>
                    <th className="p-3">Module Title</th>
                    <th className="p-3 text-center">Score (%)</th>
                    <th className="p-3 text-center">Grade</th>
                    <th className="p-3 text-center">Grade Point</th>
                    <th className="p-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getCompleteTranscriptGrades(activeStudentModal).map((grade, i) => {
                    const isMissing = grade.id?.startsWith('missing_');
                    return (
                      <tr key={grade.id || i} className={`hover:bg-slate-50 ${isMissing ? 'bg-amber-50/30' : ''}`}>
                        <td className="p-3 font-mono text-slate-400">{i + 1}</td>
                        <td className="p-3 font-mono font-bold text-indigo-600">{grade.courseCode || 'MOD'}</td>
                        <td className="p-3 font-semibold text-slate-800">{grade.courseTitle || 'Module Title'}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">
                          {isMissing ? '—' : `${grade.score}%`}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded font-bold font-mono border text-xs ${
                            isMissing 
                              ? 'bg-amber-100 text-amber-800 border-amber-300' 
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>
                            {isMissing ? 'F' : (grade.gradeStatus || '—')}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-700">
                          {isMissing ? '0.00' : Number(grade.gradePoint || 0).toFixed(2)}
                        </td>
                        <td className={`p-3 font-medium ${isMissing ? 'text-amber-700 italic' : 'text-slate-600'}`}>
                          {grade.remarks || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* GPA Summary Footer */}
            <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-2xl">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Modules Completed</p>
                <p className="text-lg font-black mt-0.5">{activeStudentModal.totalModulesGraded} / {activeStudentModal.expectedModulesCount || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Credit Units</p>
                <p className="text-lg font-black mt-0.5">{activeStudentModal.totalCredits} Units</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Calculated GPA</p>
                <p className="text-3xl font-black text-emerald-400 font-mono mt-0.5">{activeStudentModal.gpa}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}