'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { GradeAndAttendance } from '@/app/lib/gradeAttendanceFirebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';

const STUDY_LEVELS = [
  'All Levels',
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'Postgraduate / Masters',
];

export default function ExamAnalyticsDashboardPage({ staffProfile }) {
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
  // 2. MASTER DATA STORES & FILTER STATES
  // ---------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [students, setStudents] = useState([]);
  const [allModules, setAllModules] = useState([]);
  const [allOfferings, setAllOfferings] = useState([]);
  const [allGrades, setAllGrades] = useState([]);

  // Primary Global Filters
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedSemesterId, setSelectedSemesterId] = useState('');
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('');
  const [selectedStudyLevel, setSelectedStudyLevel] = useState('All Levels');
  const [selectedAwardType, setSelectedAwardType] = useState('');

  // Scoped Filters for #resultReport Table
  const [reportModuleId, setReportModuleId] = useState('');
  const [reportSearch, setReportSearch] = useState('');

  // Scoped Selectors for Leaderboards
  const [topProgId, setTopProgId] = useState('');
  const [topModId, setTopModId] = useState('');

  // ---------------------------------------------------------------------------
  // 3. FETCH BASELINE DATA & REAL-TIME GRADE LISTENER
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!institutionId || institutionId === 'N/A') {
      setLoading(false);
      return;
    }

    let unsubGrades;

    const fetchBaseData = async () => {
      setLoading(true);
      try {
        const [semSnap, progSnap, studSnap, modSnap, offeringSnap] = await Promise.all([
          getDocs(query(collection(db, 'semesters'), where('institutionId', '==', institutionId))),
          getDocs(query(collection(db, 'programmes'), where('institutionId', '==', institutionId))),
          getDocs(query(collection(db, 'students'), where('institutionID', '==', institutionId))),
          getDocs(query(collection(db, 'programme_modules'), where('institutionId', '==', institutionId))),
          getDocs(query(collection(db, 'programme_module_offerings'), where('institutionId', '==', institutionId))),
        ]);

        const loadedSems = semSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedProgs = progSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedStuds = studSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedMods = modSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedOfferings = offeringSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setSemesters(loadedSems);
        setProgrammes(loadedProgs);
        setStudents(loadedStuds);
        setAllModules(loadedMods);
        setAllOfferings(loadedOfferings);

        if (loadedSems.length > 0) {
          const active = loadedSems.find((s) => s.status === 'Active') || loadedSems[0];
          setSelectedAcademicYear(active.academicYear || '');
          setSelectedSemesterId(active.id);
        }

        if (loadedProgs.length > 0) {
          setTopProgId(loadedProgs[0].id);
        }

        const qGrades = query(
          collection(GradeAndAttendance, 'exams_grades'),
          where('institutionID', '==', institutionId)
        );

        unsubGrades = onSnapshot(qGrades, (snapshot) => {
          const grades = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          setAllGrades(grades);
        });
      } catch (err) {
        console.error('Error loading exam dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBaseData();

    return () => {
      if (unsubGrades) unsubGrades();
    };
  }, [institutionId]);

  // ---------------------------------------------------------------------------
  // 4. LOOKUP MAPS & FILTER LISTS
  // ---------------------------------------------------------------------------
  const programmeMap = useMemo(() => new Map(programmes.map((p) => [p.id, p])), [programmes]);
  const modulesMap = useMemo(() => new Map(allModules.map((m) => [m.id, m])), [allModules]);

  const academicYearsList = useMemo(() => {
    const yrs = semesters.map((s) => s.academicYear).filter(Boolean);
    return Array.from(new Set(yrs));
  }, [semesters]);

  const awardTypesList = useMemo(() => {
    const types = programmes
      .map((p) => p.awardType || p.degreeType || p.credential)
      .filter(Boolean);
    return Array.from(new Set(types));
  }, [programmes]);

  const filteredSemesters = useMemo(() => {
    if (!selectedAcademicYear) return semesters;
    return semesters.filter((s) => s.academicYear === selectedAcademicYear);
  }, [semesters, selectedAcademicYear]);

  const getAssignedModules = (progId, studyLvl, semId) => {
    if (!progId) return [];

    if (semId) {
      const offering = allOfferings.find(
        (o) =>
          o.programmeId === progId &&
          o.semesterId === semId &&
          (!studyLvl || o.studyLevel === studyLvl)
      );
      if (offering?.moduleIds?.length > 0) {
        return offering.moduleIds.map((id) => modulesMap.get(id)).filter(Boolean);
      }
    }

    return allModules.filter(
      (m) =>
        (m.programmeId === progId || m.programme === progId) &&
        (!studyLvl || !m.studyLevel || m.studyLevel === studyLvl)
    );
  };

  const scopedGrades = useMemo(() => {
    const validSemIds = new Set(filteredSemesters.map((s) => s.id));

    return allGrades.filter((g) => {
      if (selectedAcademicYear && g.semesterId && !validSemIds.has(g.semesterId)) return false;
      if (selectedSemesterId && g.semesterId !== selectedSemesterId) return false;
      if (selectedProgrammeId && g.programmeId !== selectedProgrammeId) return false;
      if (selectedStudyLevel !== 'All Levels' && g.studyLevel !== selectedStudyLevel) return false;

      if (selectedAwardType) {
        const pObj = programmeMap.get(g.programmeId);
        const pAward = pObj?.awardType || pObj?.degreeType || pObj?.credential || '';
        if (pAward !== selectedAwardType) return false;
      }

      return true;
    });
  }, [
    allGrades,
    filteredSemesters,
    selectedAcademicYear,
    selectedSemesterId,
    selectedProgrammeId,
    selectedStudyLevel,
    selectedAwardType,
    programmeMap,
  ]);

  // ---------------------------------------------------------------------------
  // 5. MODULE GRADE MATRIX & OUTCOME ANALYSIS
  // ---------------------------------------------------------------------------
  const moduleStatsList = useMemo(() => {
    const statsMap = new Map();
    const gradeLookup = new Map();

    scopedGrades.forEach((g) => {
      if (g.studentId && g.moduleId) {
        gradeLookup.set(`${g.studentId}_${g.moduleId}`, g);
      }
    });

    const getOrCreateRow = (modId, modObj = null, fallbackGrade = null) => {
      if (!statsMap.has(modId)) {
        statsMap.set(modId, {
          moduleId: modId,
          moduleCode: modObj?.moduleCode || modObj?.code || fallbackGrade?.courseCode || 'MOD',
          moduleTitle:
            modObj?.moduleTitle || modObj?.title || modObj?.name || fallbackGrade?.courseTitle || 'Untitled Module',
          A: 0,
          B: 0,
          C: 0,
          D: 0,
          E: 0,
          F: 0,
          M: 0,
          totalExpected: 0,
        });
      }
      return statsMap.get(modId);
    };

    const enrolledStudents = students.filter((s) => {
      const progId = s.programmeId || s.programme || '';
      const lvl = s.studyLevel || 'Year 1';
      if (selectedProgrammeId && progId !== selectedProgrammeId) return false;
      if (selectedStudyLevel !== 'All Levels' && lvl !== selectedStudyLevel) return false;

      if (selectedAwardType) {
        const pObj = programmeMap.get(progId);
        const pAward = pObj?.awardType || pObj?.degreeType || pObj?.credential || '';
        if (pAward !== selectedAwardType) return false;
      }

      return true;
    });

    const processedPairs = new Set();

    enrolledStudents.forEach((st) => {
      const stId = st.studentId || st.id;
      const progId = st.programmeId || st.programme || '';
      const lvl = st.studyLevel || 'Year 1';
      const assignedMods = getAssignedModules(progId, lvl, selectedSemesterId);

      assignedMods.forEach((mod) => {
        const key = `${stId}_${mod.id}`;
        processedPairs.add(key);

        const row = getOrCreateRow(mod.id, mod);
        row.totalExpected++;

        const grade = gradeLookup.get(key);
        const letter = (grade?.gradeStatus || '').toUpperCase();

        if (letter === 'A') row.A++;
        else if (letter === 'B') row.B++;
        else if (letter === 'C') row.C++;
        else if (letter === 'D') row.D++;
        else if (letter === 'E') row.E++;
        else if (letter === 'F') row.F++;
        else row.M++;
      });
    });

    scopedGrades.forEach((g) => {
      if (!g.moduleId) return;
      const key = `${g.studentId}_${g.moduleId}`;
      if (processedPairs.has(key)) return;
      processedPairs.add(key);

      const row = getOrCreateRow(g.moduleId, modulesMap.get(g.moduleId), g);
      row.totalExpected++;

      const letter = (g.gradeStatus || '').toUpperCase();
      if (letter === 'A') row.A++;
      else if (letter === 'B') row.B++;
      else if (letter === 'C') row.C++;
      else if (letter === 'D') row.D++;
      else if (letter === 'E') row.E++;
      else if (letter === 'F') row.F++;
      else row.M++;
    });

    return Array.from(statsMap.values())
      .map((r) => {
        const passABC = r.A + r.B + r.C;
        const averageD = r.D;
        const failEF = r.E + r.F;
        const missingM = r.M;
        const total = r.totalExpected || 1;

        return {
          ...r,
          passABC,
          averageD,
          failEF,
          missingM,
          passRatePct: Math.round(((passABC + averageD) / total) * 100),
          failRatePct: Math.round((failEF / total) * 100),
          missingRatePct: Math.round((missingM / total) * 100),
        };
      })
      .sort((a, b) => a.moduleCode.localeCompare(b.moduleCode));
  }, [
    students,
    scopedGrades,
    allModules,
    allOfferings,
    selectedProgrammeId,
    selectedStudyLevel,
    selectedAwardType,
    selectedSemesterId,
    modulesMap,
    programmeMap,
  ]);

  const filteredResultReportRows = useMemo(() => {
    return moduleStatsList.filter((row) => {
      if (reportModuleId && row.moduleId !== reportModuleId) return false;
      if (reportSearch.trim()) {
        const q = reportSearch.toLowerCase();
        const matchCode = row.moduleCode.toLowerCase().includes(q);
        const matchTitle = row.moduleTitle.toLowerCase().includes(q);
        if (!matchCode && !matchTitle) return false;
      }
      return true;
    });
  }, [moduleStatsList, reportModuleId, reportSearch]);

  // ---------------------------------------------------------------------------
  // 6. PROGRAMME / AWARD TYPE ANALYSIS (Evaluated via Cumulative GPA < 2.50 = Fail)
  // ---------------------------------------------------------------------------
  const programmeAwardAnalysis = useMemo(() => {
    const map = new Map();

    const enrolledStudents = students.filter((s) => {
      const progId = s.programmeId || s.programme || '';
      const lvl = s.studyLevel || 'Year 1';
      if (selectedProgrammeId && progId !== selectedProgrammeId) return false;
      if (selectedStudyLevel !== 'All Levels' && lvl !== selectedStudyLevel) return false;

      if (selectedAwardType) {
        const pObj = programmeMap.get(progId);
        const pAward = pObj?.awardType || pObj?.degreeType || pObj?.credential || '';
        if (pAward !== selectedAwardType) return false;
      }
      return true;
    });

    const studentGradesMap = new Map();
    scopedGrades.forEach((g) => {
      if (!g.studentId) return;
      if (!studentGradesMap.has(g.studentId)) {
        studentGradesMap.set(g.studentId, []);
      }
      studentGradesMap.get(g.studentId).push(g);
    });

    const getOrCreateProg = (progId) => {
      if (!map.has(progId)) {
        const pObj = programmeMap.get(progId);
        map.set(progId, {
          programmeId: progId,
          programmeName: pObj?.programmeName || pObj?.title || pObj?.name || 'General Programme',
          awardType: pObj?.awardType || pObj?.degreeType || pObj?.credential || 'Degree / Diploma',
          passStudents: 0,   // Cumulative GPA >= 2.50 (Passing)
          failStudents: 0,   // Cumulative GPA < 2.50 or explicit failing grade points
          missingStudents: 0,// No recorded grades / missing entries
          totalStudents: 0,
        });
      }
      return map.get(progId);
    };

    enrolledStudents.forEach((st) => {
      const stId = st.studentId || st.id;
      const progId = st.programmeId || st.programme || 'unassigned';
      const entry = getOrCreateProg(progId);
      entry.totalStudents++;

      const stGrades = studentGradesMap.get(stId) || [];
      if (stGrades.length === 0) {
        entry.missingStudents++;
        return;
      }

      let totalPoints = 0;
      let totalCredits = 0;

      stGrades.forEach((g) => {
        const gp = Number(g.gradePoint);
        const credits = Number(g.creditHours || g.credits || 3);

        if (!isNaN(gp)) {
          totalPoints += gp * credits;
          totalCredits += credits;
        }
      });

      const cumulativeGpa = totalCredits > 0 ? totalPoints / totalCredits : 0;

      // Evaluation criteria: Below 2.50 GPA is a fail
      if (totalCredits === 0) {
        entry.missingStudents++;
      } else if (cumulativeGpa < 2.50) {
        entry.failStudents++;
      } else {
        entry.passStudents++;
      }
    });

    return Array.from(map.values()).map((p) => {
      const total = p.totalStudents || 1;
      return {
        ...p,
        passABCD: p.passStudents,
        failEF: p.failStudents,
        missingM: p.missingStudents,
        totalRecords: p.totalStudents,
        passPct: Math.round((p.passStudents / total) * 100),
        failPct: Math.round((p.failStudents / total) * 100),
        missingPct: Math.round((p.missingStudents / total) * 100),
      };
    });
  }, [
    students,
    scopedGrades,
    programmeMap,
    selectedProgrammeId,
    selectedStudyLevel,
    selectedAwardType,
  ]);

  // ---------------------------------------------------------------------------
  // 7. INSTITUTIONAL KPIS & AUTOMATED ACADEMIC DIAGNOSTICS
  // ---------------------------------------------------------------------------
  const dashboardInsights = useMemo(() => {
    let passABC = 0;
    let avgD = 0;
    let failEF = 0;
    let missingM = 0;

    moduleStatsList.forEach((m) => {
      passABC += m.passABC;
      avgD += m.averageD;
      failEF += m.failEF;
      missingM += m.missingM;
    });

    const totalEntries = passABC + avgD + failEF + missingM;
    const totalPassABCD = passABC + avgD;
    const passRate = totalEntries > 0 ? ((totalPassABCD / totalEntries) * 100).toFixed(1) : '0.0';

    const highFailModules = moduleStatsList.filter((m) => m.totalExpected >= 3 && m.failRatePct >= 30);
    const pendingGradeModules = moduleStatsList.filter((m) => m.missingM > 0);
    const topPerformingModule = [...moduleStatsList]
      .filter((m) => m.totalExpected > 0 && m.missingM < m.totalExpected)
      .sort((a, b) => b.passRatePct - a.passRatePct)[0];

    return {
      passABC,
      avgD,
      failEF,
      missingM,
      totalEntries,
      totalPassABCD,
      passRate,
      highFailModules,
      pendingGradeModules,
      topPerformingModule,
    };
  }, [moduleStatsList]);

  // ---------------------------------------------------------------------------
  // 8. LEADERBOARD 1: TOP 10 PER PROGRAMME
  // ---------------------------------------------------------------------------
  const top10PerProgramme = useMemo(() => {
    const activeProg = topProgId || selectedProgrammeId;
    const studentMap = new Map();

    students.forEach((s) => {
      const progId = s.programmeId || s.programme || '';
      if (activeProg && progId !== activeProg) return;

      const stId = s.studentId || s.id;
      studentMap.set(stId, {
        studentId: stId,
        fullName: s.fullName || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        programmeId: progId,
        studyLevel: s.studyLevel || 'Year 1',
        totalPoints: 0,
        totalCredits: 0,
        gradedModules: 0,
      });
    });

    scopedGrades.forEach((g) => {
      if (activeProg && g.programmeId !== activeProg) return;
      const stId = g.studentId;
      if (!stId) return;

      if (!studentMap.has(stId)) {
        studentMap.set(stId, {
          studentId: stId,
          fullName: g.studentName || 'Student',
          programmeId: g.programmeId || '',
          studyLevel: g.studyLevel || 'Year 1',
          totalPoints: 0,
          totalCredits: 0,
          gradedModules: 0,
        });
      }

      const rec = studentMap.get(stId);
      const gp = Number(g.gradePoint) || 0;
      const credits = Number(g.creditHours || g.credits || 3);
      rec.totalPoints += gp * credits;
      rec.totalCredits += credits;
      rec.gradedModules += 1;
    });

    return Array.from(studentMap.values())
      .filter((st) => st.totalCredits > 0)
      .map((st) => {
        const pObj = programmeMap.get(st.programmeId);
        const numericGpa = st.totalPoints / st.totalCredits;
        return {
          ...st,
          numericGpa,
          gpa: numericGpa.toFixed(2),
          programmeName: pObj?.programmeName || pObj?.title || pObj?.name || 'General Programme',
          awardType: pObj?.awardType || pObj?.degreeType || '',
        };
      })
      .sort((a, b) => b.numericGpa - a.numericGpa || b.gradedModules - a.gradedModules)
      .slice(0, 10);
  }, [students, scopedGrades, topProgId, selectedProgrammeId, programmeMap]);

  // ---------------------------------------------------------------------------
  // 9. LEADERBOARD 2: TOP 5 PER MODULE
  // ---------------------------------------------------------------------------
  const top5PerModule = useMemo(() => {
    const activeMod = topModId || reportModuleId;
    const modGroups = new Map();

    scopedGrades.forEach((g) => {
      if (!g.moduleId) return;
      if (activeMod && g.moduleId !== activeMod) return;
      if (g.score === undefined || g.score === null || g.score === '') return;

      if (!modGroups.has(g.moduleId)) {
        modGroups.set(g.moduleId, []);
      }

      modGroups.get(g.moduleId).push({
        studentId: g.studentId,
        studentName: g.studentName || 'Student',
        score: Number(g.score) || 0,
        gradeStatus: (g.gradeStatus || '—').toUpperCase(),
        gradePoint: Number(g.gradePoint || 0).toFixed(2),
        courseCode: g.courseCode || 'MOD',
        courseTitle: g.courseTitle || 'Module',
      });
    });

    const list = [];
    modGroups.forEach((entries, modId) => {
      entries.sort((a, b) => b.score - a.score);
      const modObj = modulesMap.get(modId);
      list.push({
        moduleId: modId,
        moduleCode: modObj?.moduleCode || modObj?.code || entries[0]?.courseCode || 'MOD',
        moduleTitle: modObj?.moduleTitle || modObj?.title || modObj?.name || entries[0]?.courseTitle || 'Module',
        top5: entries.slice(0, 5),
      });
    });

    return list.sort((a, b) => a.moduleCode.localeCompare(b.moduleCode));
  }, [scopedGrades, topModId, reportModuleId, modulesMap]);

  // ---------------------------------------------------------------------------
  // 10. CSV EXPORT & ACTIONS
  // ---------------------------------------------------------------------------
  const handleExportReportCSV = () => {
    const headers = [
      'Module Code',
      'Module Name',
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'M (Missing)',
      'Pass (A-C)',
      'Average (D)',
      'Fail (E-F)',
      'Total Students',
      'Pass Rate (%)',
    ];

    const rows = filteredResultReportRows.map((r) => [
      `"${r.moduleCode}"`,
      `"${r.moduleTitle.replace(/"/g, '""')}"`,
      r.A,
      r.B,
      r.C,
      r.D,
      r.E,
      r.F,
      r.M,
      r.passABC,
      r.averageD,
      r.failEF,
      r.totalExpected,
      `${r.passRatePct}%`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `exam_analytics_report_${selectedAcademicYear || 'session'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ---------------------------------------------------------------------------
  // 11. RENDER UI & ACCESS GUARD
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-12 space-y-4">
        <div className="w-12 h-12 rounded-2xl border-4 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-sm font-bold text-slate-600 tracking-wide">
          Synthesizing Institutional Examination Intelligence...
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
        <h2 className="text-lg font-bold text-slate-800">Examination Dashboard Restricted</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Unable to resolve Institution ID. Please log in with authorized administrative or academic registry credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 font-sans bg-slate-50/50 min-h-screen print:bg-white print:p-0">
      {/* =====================================================================
          1. COMMAND CENTER HEADER
      ====================================================================== */}
      <div className="bg-slate-950 text-white p-8 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden print:bg-slate-900">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Academic Senate & Registry Analytics
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Examination Performance Command Center
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Real-time cohort grade distribution (<span className="font-mono text-indigo-300">A–F & M</span>), module pass/fail diagnostics, programme award type outcomes, and merit leaderboards.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <div className="bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-xs font-mono">
              <span className="text-slate-400 block text-[10px] uppercase">Institution ID</span>
              <span className="font-bold text-indigo-300">{institutionId}</span>
            </div>
            <button
              onClick={handleExportReportCSV}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs px-4 py-3 rounded-2xl shadow-lg transition-all cursor-pointer"
            >
              ⬇ Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-4 py-3 rounded-2xl border border-white/15 transition-all cursor-pointer"
            >
              🖨️ Print Report
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. GLOBAL ACADEMIC SESSION & COHORT FILTER BAR
      ====================================================================== */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 print:hidden">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            <h2 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Filter by Academic Year, Semester & Cohort
            </h2>
          </div>

          {(selectedProgrammeId || selectedAwardType || selectedStudyLevel !== 'All Levels' || reportModuleId) && (
            <button
              onClick={() => {
                setSelectedProgrammeId('');
                setSelectedAwardType('');
                setSelectedStudyLevel('All Levels');
                setReportModuleId('');
              }}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline"
            >
              Clear Active Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Academic Year</label>
            <select
              value={selectedAcademicYear}
              onChange={(e) => {
                setSelectedAcademicYear(e.target.value);
                setSelectedSemesterId('');
              }}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-slate-50/60 font-mono font-bold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
            >
              <option value="">All Academic Years</option>
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
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-slate-50/60 font-bold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
            >
              <option value="">All Semesters</option>
              {filteredSemesters.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.semesterName || sem.code} {sem.status === 'Active' ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Award Type</label>
            <select
              value={selectedAwardType}
              onChange={(e) => setSelectedAwardType(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-slate-50/60 font-bold text-purple-900 focus:bg-white focus:border-indigo-500 outline-none"
            >
              <option value="">All Award Types</option>
              {awardTypesList.map((aw) => (
                <option key={aw} value={aw}>{aw}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Programme</label>
            <select
              value={selectedProgrammeId}
              onChange={(e) => {
                setSelectedProgrammeId(e.target.value);
                setReportModuleId('');
              }}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-slate-50/60 font-bold text-indigo-950 focus:bg-white focus:border-indigo-500 outline-none"
            >
              <option value="">All Programmes</option>
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
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-slate-50/60 font-bold text-emerald-800 focus:bg-white focus:border-indigo-500 outline-none"
            >
              {STUDY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. EXECUTIVE KPI RIBBON
      ====================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Overall Pass Rate (A–D)
          </span>
          <div className="text-3xl font-black text-slate-900 mt-1 font-mono">{dashboardInsights.passRate}%</div>
          <span className="text-[11px] text-slate-500 mt-1">
            {dashboardInsights.totalPassABCD} of {dashboardInsights.totalEntries} enrollments
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">
            Clear Pass (A, B, C)
          </span>
          <div className="text-3xl font-black text-emerald-700 mt-1 font-mono">{dashboardInsights.passABC}</div>
          <span className="text-[11px] text-emerald-600/80 mt-1">Strong module mastery</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-amber-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">
            Average Pass (D)
          </span>
          <div className="text-3xl font-black text-amber-700 mt-1 font-mono">{dashboardInsights.avgD}</div>
          <span className="text-[11px] text-amber-600/80 mt-1">Minimum pass threshold</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-red-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-600">
            Total Fail (E, F)
          </span>
          <div className="text-3xl font-black text-red-700 mt-1 font-mono">{dashboardInsights.failEF}</div>
          <span className="text-[11px] text-red-600/80 mt-1">Eligible for supplementary exam</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
            Without Grades (M)
          </span>
          <div className="text-3xl font-black text-slate-700 mt-1 font-mono">{dashboardInsights.missingM}</div>
          <span className="text-[11px] text-slate-500 mt-1">Pending lecturer submission</span>
        </div>
      </div>

      {/* =====================================================================
          4. #resultReport — GRADE DISTRIBUTION MATRIX BY MODULE
      ====================================================================== */}
      <div id="resultReport" className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Result Report — Grade Distribution Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Comprehensive count of letter grades (<span className="font-bold text-slate-700">A, B, C, D, E, F</span>) and ungraded enrollments (<span className="font-bold text-slate-700">M</span>) per module.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-50"
            >
              <option value="">Semester: All</option>
              {filteredSemesters.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.semesterName || sem.code}
                </option>
              ))}
            </select>

            <select
              value={reportModuleId}
              onChange={(e) => setReportModuleId(e.target.value)}
              className="border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-indigo-900 bg-slate-50 max-w-[230px]"
            >
              <option value="">Module: All Modules</option>
              {allModules
                .filter((m) => !selectedProgrammeId || m.programmeId === selectedProgrammeId || m.programme === selectedProgrammeId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.moduleCode || m.code} — {m.moduleTitle || m.title || m.name}
                  </option>
                ))}
            </select>

            <input
              type="text"
              placeholder="Quick search module..."
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              className="border border-slate-200 px-3 py-2 rounded-xl text-xs bg-slate-50 text-slate-800 w-44 focus:bg-white outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                <th className="p-3.5 rounded-tl-xl w-10">#</th>
                <th className="p-3.5">Module Name</th>
                <th className="p-3.5 text-center text-indigo-300 font-black">A</th>
                <th className="p-3.5 text-center text-sky-300 font-black">B</th>
                <th className="p-3.5 text-center text-emerald-300 font-black">C</th>
                <th className="p-3.5 text-center text-amber-300 font-black">D</th>
                <th className="p-3.5 text-center text-orange-300 font-black">E</th>
                <th className="p-3.5 text-center text-rose-300 font-black">F</th>
                <th className="p-3.5 text-center text-slate-300 font-black">M</th>
                <th className="p-3.5 text-center rounded-tr-xl font-black">Expected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredResultReportRows.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center p-12 text-slate-400 italic">
                    No module grade records match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredResultReportRows.map((row, idx) => (
                  <tr key={row.moduleId} className="hover:bg-slate-50/90 transition-colors">
                    <td className="p-3.5 font-mono text-slate-400">{idx + 1}</td>
                    <td className="p-3.5">
                      <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-[11px] mr-2">
                        {row.moduleCode}
                      </span>
                      <span className="font-bold text-slate-900">{row.moduleTitle}</span>
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-indigo-700 bg-indigo-50/25">{row.A}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-blue-700 bg-blue-50/25">{row.B}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-emerald-700 bg-emerald-50/25">{row.C}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-amber-700 bg-amber-50/25">{row.D}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-orange-700 bg-orange-50/25">{row.E}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-red-700 bg-red-50/25">{row.F}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-600 bg-slate-100/70">{row.M}</td>
                    <td className="p-3.5 text-center font-mono font-black text-slate-900">{row.totalExpected}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          5. DUAL ANALYSIS SECTION
      ====================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT ANALYSIS: PER MODULE OUTCOMES */}
        <div id="moduleOutcomeAnalysis" className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5 flex flex-col">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-black text-slate-900">
              Module Outcome Analysis
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Total Pass (<strong className="text-emerald-700">A, B, C</strong>), Average (<strong className="text-amber-700">D</strong>), Fail (<strong className="text-red-700">E, F</strong>), and Without Grades (<strong className="text-slate-700">M</strong>) per module.
            </p>
          </div>

          <div className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
            {filteredResultReportRows.length === 0 ? (
              <p className="text-center p-10 text-xs text-slate-400 italic">No module outcome data available.</p>
            ) : (
              filteredResultReportRows.map((mod) => {
                const denom = mod.totalExpected || 1;
                const wPass = (mod.passABC / denom) * 100;
                const wAvg = (mod.averageD / denom) * 100;
                const wFail = (mod.failEF / denom) * 100;
                const wMiss = (mod.missingM / denom) * 100;

                return (
                  <div key={mod.moduleId} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-indigo-600 uppercase">{mod.moduleCode}</span>
                        <h3 className="text-xs font-bold text-slate-900">{mod.moduleTitle}</h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-700">
                        {mod.totalExpected} Cohort
                      </span>
                    </div>

                    <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden flex">
                      <div style={{ width: `${wPass}%` }} className="bg-emerald-500" title={`Pass: ${mod.passABC}`} />
                      <div style={{ width: `${wAvg}%` }} className="bg-amber-400" title={`Average: ${mod.averageD}`} />
                      <div style={{ width: `${wFail}%` }} className="bg-red-500" title={`Fail: ${mod.failEF}`} />
                      <div style={{ width: `${wMiss}%` }} className="bg-slate-400" title={`Missing: ${mod.missingM}`} />
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center pt-1">
                      <div className="bg-emerald-50/90 border border-emerald-100 rounded-xl p-2">
                        <span className="block text-[9px] font-bold text-emerald-700 uppercase">Pass (A–C)</span>
                        <span className="text-sm font-black text-emerald-800 font-mono">{mod.passABC}</span>
                      </div>
                      <div className="bg-amber-50/90 border border-amber-100 rounded-xl p-2">
                        <span className="block text-[9px] font-bold text-amber-700 uppercase">Average (D)</span>
                        <span className="text-sm font-black text-amber-800 font-mono">{mod.averageD}</span>
                      </div>
                      <div className="bg-red-50/90 border border-red-100 rounded-xl p-2">
                        <span className="block text-[9px] font-bold text-red-700 uppercase">Fail (E–F)</span>
                        <span className="text-sm font-black text-red-800 font-mono">{mod.failEF}</span>
                      </div>
                      <div className="bg-slate-100 border border-slate-200 rounded-xl p-2">
                        <span className="block text-[9px] font-bold text-slate-600 uppercase">No Grade (M)</span>
                        <span className="text-sm font-black text-slate-800 font-mono">{mod.missingM}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT ANALYSIS: PER PROGRAMME & AWARD TYPE */}
        <div id="programmeAwardAnalysis" className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5 flex flex-col">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-black text-slate-900">
              Programme & Award Type Analysis
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Passing Students (<strong className="text-emerald-700">GPA $\ge$ 2.50</strong>), Failing Students (<strong className="text-red-700">GPA &lt; 2.50</strong>), and Without Grades (<strong className="text-slate-700">M</strong>) per Programme Award Type.
            </p>
          </div>

          <div className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
            {programmeAwardAnalysis.length === 0 ? (
              <p className="text-center p-10 text-xs text-slate-400 italic">No programme award analytics available.</p>
            ) : (
              programmeAwardAnalysis.map((prog) => (
                <div key={prog.programmeId} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      {/* Prominent Award Type Tag */}
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-purple-100 text-purple-900 text-[10px] font-extrabold uppercase tracking-wide border border-purple-200 shadow-xs">
                        🎓 {prog.awardType}
                      </span>
                      <h3 className="text-xs font-bold text-slate-900 mt-1.5">{prog.programmeName}</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-black px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {prog.passPct}% Pass
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-1 font-mono">{prog.totalStudents} Students</span>
                    </div>
                  </div>

                  <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden flex">
                    <div style={{ width: `${prog.passPct}%` }} className="bg-emerald-500" title={`Pass (GPA >= 2.50): ${prog.passABCD}`} />
                    <div style={{ width: `${prog.failPct}%` }} className="bg-red-500" title={`Fail (GPA < 2.50): ${prog.failEF}`} />
                    <div style={{ width: `${prog.missingPct}%` }} className="bg-slate-400" title={`Without Grades (M): ${prog.missingM}`} />
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-center pt-1">
                    <div className="bg-emerald-50/90 border border-emerald-100 rounded-xl p-2.5">
                      <span className="block text-[9px] font-bold text-emerald-700 uppercase">Passing (GPA $\ge$ 2.50)</span>
                      <span className="text-base font-black text-emerald-800 font-mono">{prog.passABCD}</span>
                    </div>
                    <div className="bg-red-50/90 border border-red-100 rounded-xl p-2.5">
                      <span className="block text-[9px] font-bold text-red-700 uppercase">Failing (GPA &lt; 2.50)</span>
                      <span className="text-base font-black text-red-800 font-mono">{prog.failEF}</span>
                    </div>
                    <div className="bg-slate-100 border border-slate-200 rounded-xl p-2.5">
                      <span className="block text-[9px] font-bold text-slate-600 uppercase">Without Grades</span>
                      <span className="text-base font-black text-slate-800 font-mono">{prog.missingM}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          6. HONORS & LEADERBOARDS
      ====================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* TOP 10 PER PROGRAMME */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-black text-slate-900">
                🏆 Top 10 Students per Programme
              </h2>
              <p className="text-xs text-slate-500">Ranked by cumulative credit-weighted GPA.</p>
            </div>

            <select
              value={topProgId}
              onChange={(e) => setTopProgId(e.target.value)}
              className="border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-indigo-950 bg-slate-50 max-w-[230px] print:hidden"
            >
              <option value="">All Programmes Combined</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.programmeName || p.title || p.name} {p.awardType ? `(${p.awardType})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px] tracking-wider">
                  <th className="p-3 w-12">Rank</th>
                  <th className="p-3">Student</th>
                  <th className="p-3">Level</th>
                  <th className="p-3 text-right">GPA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {top10PerProgramme.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center p-10 text-slate-400 italic">
                      No ranked student records found for this programme.
                    </td>
                  </tr>
                ) : (
                  top10PerProgramme.map((st, idx) => {
                    const badge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                    return (
                      <tr key={st.studentId} className="hover:bg-slate-50/90 transition-colors">
                        <td className="p-3 font-mono font-black text-indigo-700">{badge}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{st.fullName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {st.studentId} • {st.programmeName} {st.awardType ? `[${st.awardType}]` : ''}
                          </div>
                        </td>
                        <td className="p-3 text-slate-600 font-semibold">{st.studyLevel}</td>
                        <td className="p-3 text-right">
                          <span className="inline-block px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-mono font-black border border-emerald-200">
                            {st.gpa}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* TOP 5 PER MODULE */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-black text-slate-900">
                ⭐ Top 5 Students per Module
              </h2>
              <p className="text-xs text-slate-500">Highest exam scorers within individual modules.</p>
            </div>

            <select
              value={topModId}
              onChange={(e) => setTopModId(e.target.value)}
              className="border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-blue-950 bg-slate-50 max-w-[230px] print:hidden"
            >
              <option value="">All Modules</option>
              {allModules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.moduleCode || m.code} — {m.moduleTitle || m.title || m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
            {top5PerModule.length === 0 ? (
              <p className="text-center p-10 text-xs text-slate-400 italic">
                No module score leaderboards available for the selected scope.
              </p>
            ) : (
              top5PerModule.map((mod) => (
                <div key={mod.moduleId} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-2.5">
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                    <h3 className="text-xs font-extrabold text-slate-900">
                      <span className="font-mono text-indigo-600 mr-1.5">{mod.moduleCode}</span>
                      {mod.moduleTitle}
                    </h3>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                      Top {mod.top5.length}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {mod.top5.map((stud, idx) => (
                      <div
                        key={`${stud.studentId}_${idx}`}
                        className="flex justify-between items-center bg-white px-3 py-2 rounded-xl border border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 font-mono font-bold text-[10px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-slate-800">{stud.studentName}</span>
                            <span className="text-[10px] text-slate-400 font-mono ml-2">
                              {stud.studentId}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[10px]">
                            {stud.gradeStatus}
                          </span>
                          <span className="font-mono font-black text-emerald-700">
                            {stud.score}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}