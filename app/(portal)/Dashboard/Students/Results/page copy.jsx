'use client';
// app/(portal)/Student/Results/page.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { GradeAndAttendance } from '@/app/lib/gradeAttendanceFirebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';

export default function StudentResultPage({ studentProfile }) {
  const { user } = useAuth();

  // ---------------------------------------------------------------------------
  // 1. AUTHENTICATION & STUDENT IDENTIFIER RESOLUTION
  // ---------------------------------------------------------------------------
  const authData = user?.data || user || {};

  const currentInstitutionId =
    studentProfile?.institutionID ||
    studentProfile?.schoolId ||
    authData?.institutionID ||
    authData?.schoolId ||
    user?.institutionID ||
    user?.schoolId ||
    '';

  const studentId =
    studentProfile?.studentId ||
    studentProfile?.studentID ||
    authData?.studentId ||
    authData?.studentID ||
    user?.studentId ||
    user?.studentID ||
    '';

  const studentName =
    studentProfile?.fullName ||
    authData?.fullName ||
    authData?.name ||
    user?.displayName ||
    'Student';

  const studentProgrammeId =
    studentProfile?.programmeId ||
    studentProfile?.programme ||
    authData?.programmeId ||
    '';

  const studentStudyLevel =
    studentProfile?.studyLevel ||
    authData?.studyLevel ||
    'Year 1';

  const isAuthorized = Boolean(currentInstitutionId && (studentId || authData?.email));

  // ---------------------------------------------------------------------------
  // 2. STATE STORES
  // ---------------------------------------------------------------------------
  const [semesters, setSemesters] = useState([]);
  const [modules, setModules] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [allGrades, setAllGrades] = useState([]);

  // Filter states
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedSemesterId, setSelectedSemesterId] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ---------------------------------------------------------------------------
  // 3. FETCH REFERENCE DATA & SUBSCRIBE TO STUDENT GRADES
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    let unsubGrades;

    const fetchResultReferences = async () => {
      setLoading(true);
      setError('');
      try {
        const [semSnap, modSnap, progModSnap, progSnap] = await Promise.all([
          getDocs(query(collection(db, 'semesters'), where('institutionId', '==', currentInstitutionId))),
          getDocs(query(collection(db, 'modules'), where('institutionId', '==', currentInstitutionId))),
          getDocs(query(collection(db, 'programme_modules'), where('institutionId', '==', currentInstitutionId))),
          getDocs(query(collection(db, 'programmes'), where('institutionId', '==', currentInstitutionId))),
        ]);

        const loadedSemesters = semSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSemesters(loadedSemesters);
        setProgrammes(progSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const rawModules = [
          ...modSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...progModSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ];
        setModules(Array.from(new Map(rawModules.map((m) => [m.id, m])).values()));

        if (loadedSemesters.length > 0) {
          const activeSem = loadedSemesters.find((s) => s.status === 'Active') || loadedSemesters[0];
          setSelectedAcademicYear(activeSem.academicYear);
          setSelectedSemesterId(activeSem.id);
        }

        // Real-time listener for grades belonging to this institution
        const qGrades = query(
          collection(GradeAndAttendance, 'exams_grades'),
          where('institutionID', '==', currentInstitutionId)
        );

        unsubGrades = onSnapshot(
          qGrades,
          (snapshot) => {
            const gradesList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            
            // Filter strictly for this student
            const myGrades = gradesList.filter((g) => {
              return (
                g.studentId === studentId ||
                g.studentId?.toLowerCase() === studentId?.toLowerCase()
              );
            });

            setAllGrades(myGrades);
            setLoading(false);
          },
          (err) => {
            console.error('Error fetching grades:', err);
            setError('Failed to load your examination results.');
            setLoading(false);
          }
        );
      } catch (err) {
        console.error('Error loading result references:', err);
        setError('Failed to initialize academic records.');
        setLoading(false);
      }
    };

    fetchResultReferences();

    return () => {
      if (unsubGrades) unsubGrades();
    };
  }, [currentInstitutionId, studentId, isAuthorized]);

  // ---------------------------------------------------------------------------
  // 4. LOOKUPS & FILTERS
  // ---------------------------------------------------------------------------
  const semesterMap = useMemo(() => new Map(semesters.map((s) => [s.id, s])), [semesters]);
  const moduleMap = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);
  const programmeMap = useMemo(() => new Map(programmes.map((p) => [p.id, p])), [programmes]);

  const availableAcademicYears = useMemo(() => {
    const years = semesters.map((s) => s.academicYear).filter(Boolean);
    return Array.from(new Set(years));
  }, [semesters]);

  const filteredSemestersForYear = useMemo(() => {
    if (!selectedAcademicYear) return semesters;
    return semesters.filter((s) => s.academicYear === selectedAcademicYear);
  }, [semesters, selectedAcademicYear]);

  // Filter grades by selected semester / year
  const activeSemesterGrades = useMemo(() => {
    return allGrades.filter((g) => {
      const matchesSemester = selectedSemesterId ? g.semesterId === selectedSemesterId : true;
      const matchesYear = selectedAcademicYear ? g.academicYear === selectedAcademicYear : true;
      return matchesSemester && matchesYear;
    });
  }, [allGrades, selectedSemesterId, selectedAcademicYear]);

  // Calculate Semester GPA & Total Credits
  const semesterSummary = useMemo(() => {
    if (activeSemesterGrades.length === 0) return { gpa: '0.00', totalCredits: 0, earnedCredits: 0 };

    let totalQualityPoints = 0;
    let totalCredits = 0;
    let earnedCredits = 0;

    activeSemesterGrades.forEach((g) => {
      const mod = moduleMap.get(g.moduleId);
      const credits = Number(mod?.creditHours || mod?.credits || 3);
      const gp = Number(g.gradePoint || 0);

      totalCredits += credits;
      totalQualityPoints += gp * credits;

      if (g.gradeStatus && g.gradeStatus !== 'F') {
        earnedCredits += credits;
      }
    });

    const gpa = totalCredits > 0 ? (totalQualityPoints / totalCredits).toFixed(2) : '0.00';
    return { gpa, totalCredits, earnedCredits };
  }, [activeSemesterGrades, moduleMap]);

  // ---------------------------------------------------------------------------
  // 5. PRINT / TRANSCRIPT EXPORT HANDLER
  // ---------------------------------------------------------------------------
  const escapeHTML = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[char])
    );

  const handlePrintResult = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print your grade report.');
      return;
    }

    const currentSemObj = semesterMap.get(selectedSemesterId);
    const semName = currentSemObj?.semesterName || currentSemObj?.code || 'Semester Result';

    const rowsHTML = activeSemesterGrades
      .map((g, idx) => {
        const mod = moduleMap.get(g.moduleId);
        const code = escapeHTML(g.courseCode || mod?.moduleCode || 'MOD');
        const title = escapeHTML(g.courseTitle || mod?.moduleTitle || 'Module');
        const credits = escapeHTML(mod?.creditHours || mod?.credits || 3);
        const score = escapeHTML(g.score);
        const grade = escapeHTML(g.gradeStatus || '-');
        const gp = escapeHTML(Number(g.gradePoint || 0).toFixed(2));
        const remarks = escapeHTML(g.remarks || '-');

        return `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${code}</strong></td>
            <td>${title}</td>
            <td>${credits} Hrs</td>
            <td><strong>${score}</strong></td>
            <td><span class="badge">${grade}</span></td>
            <td>${gp}</td>
            <td>${remarks}</td>
          </tr>
        `;
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Grade Report - ${escapeHTML(studentName)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #1e293b; }
            .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #cbd5e1; padding-bottom: 15px; }
            h1 { font-size: 20px; margin: 0 0 5px 0; text-transform: uppercase; color: #0f172a; }
            .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; margin-bottom: 20px; font-size: 12px; line-height: 1.6; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 11px; text-align: left; }
            th { background: #f1f5f9; text-transform: uppercase; font-size: 10px; color: #475569; }
            .summary { margin-top: 20px; background: #f1f5f9; padding: 12px; font-size: 12px; display: flex; justify-content: space-between; font-weight: bold; border: 1px solid #cbd5e1; }
            .badge { background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
            @media print {
              body { margin: 0; padding: 15px; }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Official Semester Grade Report</h1>
            <div style="font-size: 12px; color: #64748b;">Institution ID: ${escapeHTML(currentInstitutionId)}</div>
          </div>

          <div class="meta-box">
            <div>
              <strong>Student Name:</strong> ${escapeHTML(studentName)}<br/>
              <strong>Student ID:</strong> ${escapeHTML(studentId)}<br/>
              <strong>Study Level:</strong> ${escapeHTML(studentStudyLevel)}
            </div>
            <div>
              <strong>Academic Year:</strong> ${escapeHTML(selectedAcademicYear)}<br/>
              <strong>Semester:</strong> ${escapeHTML(semName)}<br/>
              <strong>Programme:</strong> ${escapeHTML(programmeMap.get(studentProgrammeId)?.programmeName || 'General Programme')}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Course Code</th>
                <th>Course Title</th>
                <th>Credits</th>
                <th>Score</th>
                <th>Grade</th>
                <th>GP</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML || '<tr><td colspan="8" style="text-align: center; color: #94a3b8;">No results published for this term.</td></tr>'}
            </tbody>
          </table>

          <div class="summary">
            <div>Semester GPA: ${semesterSummary.gpa}</div>
            <div>Total Registered Credits: ${semesterSummary.totalCredits} Hrs</div>
            <div>Earned Credits: ${semesterSummary.earnedCredits} Hrs</div>
          </div>

          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  // ---------------------------------------------------------------------------
  // 6. SECURITY & LOADING GUARDS
  // ---------------------------------------------------------------------------
  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 bg-white border border-red-100 rounded-2xl shadow-sm text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl mx-auto flex items-center justify-center text-2xl">
          🔒
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          You must be logged in as an active student to access your academic result portal.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-16 text-center">
        <p className="text-sm font-medium text-slate-500 animate-pulse">
          Loading your academic transcript and semester results...
        </p>
      </div>
    );
  }

  const selectedSemesterObj = semesterMap.get(selectedSemesterId);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 font-sans">
      {/* PAGE HEADER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Examination Results 🎓</h1>
          <p className="text-xs text-slate-500 mt-1">
            View your published course grades, semester GPAs, and academic standing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl border border-indigo-200">
            Student: <span className="font-bold">{studentName}</span> ({studentId})
          </div>
          <button
            onClick={handlePrintResult}
            disabled={activeSemesterGrades.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm disabled:opacity-50"
          >
            Print Result Slip
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
          {error}
        </div>
      )}

      {/* FILTER CONTROLS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-2">
          Select Academic Session & Semester
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase">
              Academic Year <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-mono font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
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
            <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase">
              Semester / Term <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="">-- Choose Semester --</option>
              {filteredSemestersForYear.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.semesterName || sem.code} {sem.status === 'Active' ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* GPA & SUMMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Semester GPA</p>
            <h3 className="text-2xl font-black text-indigo-700 mt-1">{semesterSummary.gpa}</h3>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-lg">
            📊
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Credits Registered</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{semesterSummary.totalCredits} Hrs</h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-lg">
            📚
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Credits Earned</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{semesterSummary.earnedCredits} Hrs</h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-lg">
            ✅
          </div>
        </div>
      </div>

      {/* RESULTS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Grade Breakdown ({selectedSemesterObj?.semesterName || 'Selected Semester'})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Published results for {selectedAcademicYear || 'Academic Year'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <th className="p-3 w-12">#</th>
                <th className="p-3">Course Code</th>
                <th className="p-3">Course Title</th>
                <th className="p-3 w-24">Credits</th>
                <th className="p-3 w-24">Score</th>
                <th className="p-3 w-24">Grade</th>
                <th className="p-3 w-24">Grade Point</th>
                <th className="p-3">Remarks / Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeSemesterGrades.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center p-12 text-slate-400 italic">
                    No examination results published for this term yet.
                  </td>
                </tr>
              ) : (
                activeSemesterGrades.map((g, idx) => {
                  const mod = moduleMap.get(g.moduleId);
                  const code = g.courseCode || mod?.moduleCode || 'MOD';
                  const title = g.courseTitle || mod?.moduleTitle || 'Module Title';
                  const credits = mod?.creditHours || mod?.credits || 3;

                  return (
                    <tr key={g.id || idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-mono font-bold text-indigo-600">{code}</td>
                      <td className="p-3 font-semibold text-slate-800">{title}</td>
                      <td className="p-3 text-slate-500">{credits} Hrs</td>
                      <td className="p-3 font-bold font-mono text-slate-700">{g.score}</td>
                      <td className="p-3">
                        <span className="inline-block bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-lg border border-indigo-200">
                          {g.gradeStatus || '-'}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-700">
                        {g.gradePoint !== undefined ? Number(g.gradePoint).toFixed(2) : '-'}
                      </td>
                      <td className="p-3 text-slate-600 italic">{g.remarks || 'No feedback provided'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}