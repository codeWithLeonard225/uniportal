'use client';
//app/(portal)/Institution/AcademicReport/page.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import { collection, getDocs, query, where } from 'firebase/firestore';

const STUDY_LEVELS = [
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'Postgraduate / Masters',
];

export default function AcademicReportPage() {
  const { user } = useAuth();

  // ✅ Retrieve institutionID from Auth Context session dynamically
  const institutionId = user?.institutionID || user?.schoolId || user?.data?.institutionID || user?.data?.schoolId || '';

  // Core Data States
  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [allModules, setAllModules] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [allOfferings, setAllOfferings] = useState([]);

  const [loading, setLoading] = useState(false);

  // --- Section 2 Filter States (Curriculum Matrix) ---
  const [matrixProgrammeId, setMatrixProgrammeId] = useState('');
  const [matrixAcademicYear, setMatrixAcademicYear] = useState('');
  const [matrixSemesterId, setMatrixSemesterId] = useState('');

  // Fetch all related structural data in parallel strictly filtered by institutionId
  useEffect(() => {
    const fetchReportData = async () => {
      if (!institutionId || institutionId === 'N/A') {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const qFaculties = query(collection(db, 'faculties'), where('institutionId', '==', institutionId));
        const qDepts = query(collection(db, 'departments'), where('institutionId', '==', institutionId));
        const qProgs = query(collection(db, 'programmes'), where('institutionId', '==', institutionId));
        const qModules = query(collection(db, 'programme_modules'), where('institutionId', '==', institutionId));
        const qSemesters = query(collection(db, 'semesters'), where('institutionId', '==', institutionId));
        const qOfferings = query(collection(db, 'programme_module_offerings'), where('institutionId', '==', institutionId));

        const [fSnap, dSnap, pSnap, mSnap, sSnap, oSnap] = await Promise.all([
          getDocs(qFaculties),
          getDocs(qDepts),
          getDocs(qProgs),
          getDocs(qModules),
          getDocs(qSemesters),
          getDocs(qOfferings),
        ]);

        const loadedFaculties = fSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedDepts = dSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedProgs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedModules = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedSemesters = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedOfferings = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setFaculties(loadedFaculties);
        setDepartments(loadedDepts);
        setProgrammes(loadedProgs);
        setAllModules(loadedModules);
        setSemesters(loadedSemesters);
        setAllOfferings(loadedOfferings);

        if (loadedProgs.length > 0) {
          setMatrixProgrammeId(loadedProgs[0].id);
        }
        if (loadedSemesters.length > 0) {
          const activeSem = loadedSemesters.find((s) => s.status === 'Active') || loadedSemesters[0];
          setMatrixAcademicYear(activeSem.academicYear || '');
          setMatrixSemesterId(activeSem.id);
        }
      } catch (err) {
        console.error('Error fetching academic report data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [institutionId]);

  // Unique academic years list
  const availableAcademicYears = useMemo(() => {
    return Array.from(new Set(semesters.map((s) => s.academicYear).filter(Boolean)));
  }, [semesters]);

  // Semesters filtered by matrix academic year
  const matrixSemestersForYear = useMemo(() => {
    if (!matrixAcademicYear) return semesters;
    return semesters.filter((s) => s.academicYear === matrixAcademicYear);
  }, [semesters, matrixAcademicYear]);

  // Sync matrix semester default when academic year changes
  useEffect(() => {
    if (matrixSemestersForYear.length > 0) {
      if (!matrixSemestersForYear.some((s) => s.id === matrixSemesterId)) {
        setMatrixSemesterId(matrixSemestersForYear[0].id);
      }
    } else {
      setMatrixSemesterId('');
    }
  }, [matrixAcademicYear, matrixSemestersForYear, matrixSemesterId]);

  // Lookup Maps
  const modulesMap = useMemo(() => new Map(allModules.map((m) => [m.id, m])), [allModules]);
  const semesterMap = useMemo(() => new Map(semesters.map((s) => [s.id, s])), [semesters]);
  const currentMatrixProgramme = useMemo(() => programmes.find((p) => p.id === matrixProgrammeId), [programmes, matrixProgrammeId]);
  const currentMatrixSemester = useMemo(() => semesters.find((s) => s.id === matrixSemesterId), [semesters, matrixSemesterId]);

  // Targeted Offerings for Matrix
  const matrixTargetOfferings = useMemo(() => {
    if (!matrixProgrammeId || !matrixSemesterId) return [];
    return allOfferings.filter(
      (o) =>
        o.programmeId === matrixProgrammeId &&
        o.semesterId === matrixSemesterId
    );
  }, [allOfferings, matrixProgrammeId, matrixSemesterId]);

  // Group matrix modules by level with resilient fallback
  const matrixModulesByLevel = useMemo(() => {
    const grouped = {};
    STUDY_LEVELS.forEach((lvl) => {
      grouped[lvl] = [];
    });

    matrixTargetOfferings.forEach((offering) => {
      const level = offering.studyLevel || 'Year 1';
      const moduleIds = offering.moduleIds || [];
      moduleIds.forEach((mId) => {
        const modObj = modulesMap.get(mId) || {
          id: mId,
          moduleCode: 'UNKNOWN',
          moduleTitle: `Missing Master Module Record (${mId.slice(0, 6)}...)`,
          creditHours: '3',
          department: 'Unassigned',
        };
        if (!grouped[level].some((m) => m.id === mId)) {
          grouped[level].push(modObj);
        }
      });
    });

    return grouped;
  }, [matrixTargetOfferings, modulesMap]);

  // Isolated Print Handler
  const handlePrintSection = (elementId) => {
    const printContent = document.getElementById(elementId);
    if (!printContent) return;

    const WindowPrt = window.open('', '', 'left=0,top=0,width=900,height=650,toolbar=0,scrollbars=0,status=0');
    WindowPrt.document.write(`
      <html>
        <head>
          <title>uniPortal - Print Report</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-8 bg-white font-sans">
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    WindowPrt.document.close();
    WindowPrt.focus();
    setTimeout(() => {
      WindowPrt.print();
      WindowPrt.close();
    }, 500);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans space-y-8">
      {/* Global Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Institutional Academic Report</h1>
          <p className="text-sm text-gray-500">
            Comprehensive structural summary compiled from Academic Structure & Curriculum registries.
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500 text-right">
            Active Institution ID:{' '}
            <span className="font-mono text-blue-600 font-semibold">{institutionId || 'N/A'}</span>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-500 text-sm">Generating academic report metrics for institution...</div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 border rounded-lg shadow-sm">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Faculties / Schools</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{faculties.length}</p>
            </div>
            <div className="bg-white p-5 border rounded-lg shadow-sm">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Departments</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{departments.length}</p>
            </div>
            <div className="bg-white p-5 border rounded-lg shadow-sm">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Programmes</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{programmes.length}</p>
            </div>
            <div className="bg-white p-5 border rounded-lg shadow-sm">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Master Modules</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{allModules.length}</p>
            </div>
          </div>

          {/* ================= SECTION 1: ACADEMIC HIERARCHY TREE ================= */}
          <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-gray-700 uppercase">Academic Hierarchy Tree</h2>
                <p className="text-xs text-gray-500">Master Institutional Structure: Faculties, Departments & Programmes</p>
              </div>
              <button
                onClick={() => handlePrintSection('printable-hierarchy-tree')}
                className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded hover:bg-slate-900 transition-colors"
              >
                Print Tree
              </button>
            </div>

            <div id="printable-hierarchy-tree" className="p-6 space-y-4">
              <div className="hidden print:block pb-4 mb-4 border-b text-center space-y-1">
                <h1 className="text-xl font-bold uppercase tracking-wide">uniPortal Institutional Report</h1>
                <h2 className="text-lg font-semibold text-blue-800">Academic Hierarchy Tree Structure</h2>
              </div>

              <div className="divide-y">
                {faculties.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-xs">No faculties configured for this institution yet.</div>
                ) : (
                  faculties.map((faculty) => {
                    const facDepts = departments.filter((d) => d.facultyId === faculty.id);
                    return (
                      <div key={faculty.id} className="py-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between bg-blue-50/50 p-3 rounded border border-blue-100">
                          <div>
                            <h3 className="font-bold text-blue-900 text-sm">
                              {faculty.facultyName} <span className="font-mono text-xs text-blue-600">({faculty.code || 'N/A'})</span>
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Dean: <span className="font-semibold text-gray-700">{faculty.currentDean || 'Unassigned'}</span>
                            </p>
                          </div>
                          <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                            {facDepts.length} Department(s)
                          </span>
                        </div>

                        <div className="pl-4 space-y-3 border-l-2 border-blue-200">
                          {facDepts.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No departments cataloged under this faculty.</p>
                          ) : (
                            facDepts.map((dept) => {
                              const deptProgs = programmes.filter((p) => p.departmentId === dept.id);
                              return (
                                <div key={dept.id} className="bg-gray-50 p-3 rounded border space-y-2">
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <h4 className="font-semibold text-xs text-gray-800">{dept.departmentName}</h4>
                                      <p className="text-[11px] text-gray-500">HOD: {dept.HOD || 'Unassigned'}</p>
                                    </div>
                                    <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-mono">
                                      {deptProgs.length} Programme(s)
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                                    {deptProgs.map((prog) => {
                                      const progModuleCount = allModules.filter((m) => m.programmeId === prog.id).length;
                                      return (
                                        <div key={prog.id} className="bg-white p-2.5 rounded border text-xs shadow-2xs flex flex-col justify-between">
                                          <div>
                                            <p className="font-bold text-gray-800">{prog.programmeName}</p>
                                            <span className="text-[10px] text-blue-600 font-semibold">{prog.awardType}</span>
                                          </div>
                                          <div className="flex justify-between items-center mt-3 pt-2 border-t text-[11px] text-gray-500">
                                            <span>{prog.durationYears} Years</span>
                                            <span className="font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                              {progModuleCount} Modules
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ================= SECTION 2: PROGRAMME CURRICULUM MATRIX ================= */}
          <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-gray-700 uppercase">Programme Curriculum Matrix</h2>
                <p className="text-xs text-gray-500">Term offerings and study level modules breakdown</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 mb-1">Programme</label>
                  <select
                    value={matrixProgrammeId}
                    onChange={(e) => setMatrixProgrammeId(e.target.value)}
                    className="border p-1.5 rounded text-xs bg-white w-48"
                  >
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>{p.programmeName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 mb-1">Academic Year</label>
                  <select
                    value={matrixAcademicYear}
                    onChange={(e) => setMatrixAcademicYear(e.target.value)}
                    className="border p-1.5 rounded text-xs bg-white w-32"
                  >
                    {availableAcademicYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 mb-1">Semester / Term</label>
                  <select
                    value={matrixSemesterId}
                    onChange={(e) => setMatrixSemesterId(e.target.value)}
                    className="border p-1.5 rounded text-xs bg-white w-40"
                  >
                    {matrixSemestersForYear.map((s) => (
                      <option key={s.id} value={s.id}>{s.semesterName}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-4">
                  <button
                    onClick={() => handlePrintSection('printable-curriculum-matrix')}
                    className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded hover:bg-slate-900 transition-colors"
                  >
                    Print Matrix
                  </button>
                </div>
              </div>
            </div>

            <div id="printable-curriculum-matrix" className="p-6 space-y-6">
              <div className="hidden print:block pb-4 border-b text-center space-y-1">
                <h1 className="text-xl font-bold uppercase tracking-wide">uniPortal Institutional Report</h1>
                <h2 className="text-lg font-semibold text-blue-800">Programme Curriculum & Term Allocation Matrix</h2>
                <div className="flex justify-center gap-6 text-xs text-gray-600 pt-1">
                  <span><strong>Programme:</strong> {currentMatrixProgramme?.programmeName || 'N/A'} ({currentMatrixProgramme?.awardType})</span>
                  <span><strong>Session:</strong> {matrixAcademicYear} - {currentMatrixSemester?.semesterName}</span>
                </div>
              </div>

              <div className="space-y-6">
                {STUDY_LEVELS.map((level) => {
                  const levelMods = matrixModulesByLevel[level] || [];
                  if (levelMods.length === 0) return null;

                  return (
                    <div key={level} className="border rounded-lg overflow-hidden">
                      <div className="bg-blue-50 px-4 py-2.5 border-b flex justify-between items-center">
                        <h3 className="font-bold text-xs uppercase text-blue-900 tracking-wide">{level} Modules</h3>
                        <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-medium">
                          {levelMods.length} Module(s)
                        </span>
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b text-[11px] text-gray-500 uppercase">
                          <tr>
                            <th className="p-2.5">Module Code</th>
                            <th className="p-2.5">Module Title</th>
                            <th className="p-2.5">Credit Hours</th>
                            <th className="p-2.5">Department / Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-xs">
                          {levelMods.map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50">
                              <td className="p-2.5 font-mono font-bold text-blue-700">{m.moduleCode}</td>
                              <td className="p-2.5 font-medium text-gray-800">{m.moduleTitle}</td>
                              <td className="p-2.5">{m.creditHours} Hrs</td>
                              <td className="p-2.5 text-gray-500">{m.department || 'General Curriculum'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                {Object.values(matrixModulesByLevel).every((arr) => arr.length === 0) && (
                  <div className="py-12 px-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs space-y-2 text-center">
                    <p className="font-bold">⚠️ No modules found for this combination.</p>
                    <p>
                      Selected Programme ID: <code className="bg-amber-100 px-1 py-0.5 rounded">{matrixProgrammeId || 'None'}</code> | 
                      Semester ID: <code className="bg-amber-100 px-1 py-0.5 rounded">{matrixSemesterId || 'None'}</code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Active Semesters & Term Allocations Log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 bg-gray-50 border-b">
                <h3 className="text-xs font-bold text-gray-700 uppercase">Academic Semesters & Status</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="p-3">Year</th>
                    <th className="p-3">Semester</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {semesters.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-6 text-center text-xs text-gray-400">No semesters found for this institution.</td>
                    </tr>
                  ) : (
                    semesters.map((s) => (
                      <tr key={s.id}>
                        <td className="p-3 font-semibold text-gray-700">{s.academicYear}</td>
                        <td className="p-3 font-medium">{s.semesterName}</td>
                        <td className="p-3">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              s.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                <h3 className="text-xs font-bold text-gray-700 uppercase">Term Course Allocations Log</h3>
                <span className="text-[11px] bg-blue-50 text-blue-700 font-mono px-2 py-0.5 rounded">
                  {allOfferings.length} Total Allocation(s)
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y">
                {allOfferings.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">No term allocations registered for this institution yet.</div>
                ) : (
                  allOfferings.map((o) => {
                    const semObj = semesterMap.get(o.semesterId);
                    return (
                      <div key={o.id} className="p-3 text-xs flex justify-between items-center hover:bg-gray-50">
                        <div>
                          <span className="font-bold text-gray-800">{o.programmeName}</span>
                          <span className="block text-[10px] text-gray-500">
                            {o.studyLevel} | {o.academicYear} ({semObj ? semObj.semesterName : 'Term'})
                          </span>
                        </div>
                        <span className="bg-blue-50 border border-blue-200 text-blue-700 font-mono px-2 py-1 rounded">
                          {(o.moduleIds || []).length} Modules
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}