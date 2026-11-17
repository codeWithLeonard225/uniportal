'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';

export default function LecturerTeachingAllocation({ staffProfile }) {
  const { user } = useAuth();

  // --------------------------------------------------
  // 1. EXTRACT LOGGED-IN STAFF IDENTIFIERS & INSTITUTION ID
  // --------------------------------------------------
  const authData = user?.data || user || {};

  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
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
    '';

  // --------------------------------------------------
  // 2. STATE STORES FOR DATA & LOOKUPS
  // --------------------------------------------------
  const [allocations, setAllocations] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [modules, setModules] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // --------------------------------------------------
  // 3. FETCH STATIC REFERENCE DATA & SUBSCRIBE TO STAFF ALLOCATIONS
  // --------------------------------------------------
  useEffect(() => {
    if (!currentInstitutionId) {
      setLoading(false);
      return;
    }

    let unsubAllocations;

    const loadAndSubscribe = async () => {
      setLoading(true);
      setError('');

      try {
        // Fetch static reference collections matching the institution
        const [facSnap, deptSnap, progSnap, moduleSnap, progModuleSnap] =
          await Promise.all([
            getDocs(
              query(
                collection(db, 'faculties'),
                where('institutionId', '==', currentInstitutionId)
              )
            ),
            getDocs(
              query(
                collection(db, 'departments'),
                where('institutionId', '==', currentInstitutionId)
              )
            ),
            getDocs(
              query(
                collection(db, 'programmes'),
                where('institutionId', '==', currentInstitutionId)
              )
            ),
            getDocs(
              query(
                collection(db, 'modules'),
                where('institutionId', '==', currentInstitutionId)
              )
            ),
            getDocs(
              query(
                collection(db, 'programme_modules'),
                where('institutionId', '==', currentInstitutionId)
              )
            ),
          ]);

        setFaculties(facSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setProgrammes(progSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const rawModules = [
          ...moduleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...progModuleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ];

        setModules(
          Array.from(new Map(rawModules.map((m) => [m.id, m])).values())
        );

        // Listen in real-time to allocations belonging to logged-in institution
        const qAlloc = query(
          collection(db, 'lecturer_module_allocations'),
          where('institutionId', '==', currentInstitutionId)
        );

        unsubAllocations = onSnapshot(
          qAlloc,
          (snapshot) => {
            const allAllocations = snapshot.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }));

            // Filter ONLY allocations matching this logged-in lecturer
            const myAllocations = allAllocations.filter((alloc) => {
              const matchesLecturerId =
                loggedInDocId && alloc.lecturerId === loggedInDocId;
              const matchesStaffId =
                loggedInStaffId &&
                (alloc.staffId === loggedInStaffId ||
                  alloc.lecturerId === loggedInStaffId);
              const matchesEmail =
                loggedInEmail &&
                alloc.email?.toLowerCase() === loggedInEmail.toLowerCase();

              return matchesLecturerId || matchesStaffId || matchesEmail;
            });

            setAllocations(myAllocations);
            setLoading(false);
          },
          (err) => {
            console.error('Error fetching allocations:', err);
            setError('Failed to load your module allocations.');
            setLoading(false);
          }
        );
      } catch (err) {
        console.error('Error fetching baseline reference data:', err);
        setError('Failed to load lookup data.');
        setLoading(false);
      }
    };

    loadAndSubscribe();

    return () => {
      if (unsubAllocations) unsubAllocations();
    };
  }, [currentInstitutionId, loggedInDocId, loggedInStaffId, loggedInEmail]);

  // --------------------------------------------------
  // 4. LOOKUP MAPS
  // --------------------------------------------------
  const facultyMap = useMemo(
    () => new Map(faculties.map((f) => [f.id, f])),
    [faculties]
  );
  const departmentMap = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments]
  );
  const programmeMap = useMemo(
    () => new Map(programmes.map((p) => [p.id, p])),
    [programmes]
  );
  const moduleMap = useMemo(
    () => new Map(modules.map((m) => [m.id, m])),
    [modules]
  );

  // --------------------------------------------------
  // 5. RESOLVE STRUCTURED ALLOCATION CARDS
  // --------------------------------------------------
  const resolvedAllocations = useMemo(() => {
    return allocations.map((alloc) => {
      const prog = programmeMap.get(alloc.programmeId);

      const programmeName =
        prog?.programmeName ||
        prog?.title ||
        prog?.name ||
        alloc.programmeName ||
        '—';

      const awardType =
        prog?.awardType ||
        prog?.award ||
        prog?.degreeType ||
        prog?.type ||
        alloc.awardType ||
        '';

      const deptId =
        alloc.departmentId || prog?.departmentId || prog?.department;
      const dept = departmentMap.get(deptId);
      const departmentName =
        dept?.departmentName || dept?.name || dept?.title || '—';

      const facId =
        alloc.facultyId ||
        prog?.facultyId ||
        prog?.faculty ||
        dept?.facultyId ||
        dept?.faculty;
      const fac = facultyMap.get(facId);
      const facultyName = fac?.facultyName || fac?.name || fac?.title || '—';

      const assignedModules = (alloc.moduleIds || [])
        .map((id) => moduleMap.get(id))
        .filter(Boolean)
        .map((m) => ({
          id: m.id,
          moduleCode: m.moduleCode || m.code || '—',
          moduleTitle: m.moduleTitle || m.title || 'Untitled Module',
          credits: m.creditHours || m.credits || 3,
        }));

      return {
        id: alloc.id,
        faculty: facultyName,
        department: departmentName,
        programme: programmeName,
        awardType: awardType,
        academicYear: alloc.academicYear || '2025/2026',
        studyLevel: alloc.studyLevel || '—',
        modules: assignedModules,
      };
    });
  }, [allocations, programmeMap, departmentMap, facultyMap, moduleMap]);

  // Search Filter
  const filteredAllocations = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();
    if (!search) return resolvedAllocations;

    return resolvedAllocations.filter((item) => {
      const searchableText = [
        item.faculty,
        item.department,
        item.programme,
        item.awardType,
        item.academicYear,
        item.studyLevel,
        ...item.modules.map((m) => m.moduleCode),
        ...item.modules.map((m) => m.moduleTitle),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(search);
    });
  }, [resolvedAllocations, searchTerm]);

  // Statistics
  const totalAllocations = filteredAllocations.length;
  const totalModulesAssigned = filteredAllocations.reduce(
    (sum, item) => sum + item.modules.length,
    0
  );

  // --------------------------------------------------
  // 6. PRINT HANDLER
  // --------------------------------------------------
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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print your teaching allocations.');
      return;
    }

    const lecturerName =
      staffProfile?.fullName ||
      authData?.fullName ||
      user?.displayName ||
      'Lecturer';

    const printContent = filteredAllocations
      .map(
        (alloc) => `
        <div class="allocation-card">
          <div class="card-header">
            <strong>Faculty:</strong> ${escapeHTML(alloc.faculty)} &nbsp;|&nbsp;
            <strong>Department:</strong> ${escapeHTML(alloc.department)}<br/>
            <strong>Programme:</strong> ${escapeHTML(alloc.programme)} ${
          alloc.awardType ? `(${escapeHTML(alloc.awardType)})` : ''
        }<br/>
            <strong>Academic Year:</strong> ${escapeHTML(
              alloc.academicYear
            )} &nbsp;|&nbsp;
            <strong>Study Level:</strong> ${escapeHTML(alloc.studyLevel)}
          </div>
          <table>
            <thead>
              <tr>
                <th>Module Code</th>
                <th>Module Title</th>
                <th>Credit Hours</th>
              </tr>
            </thead>
            <tbody>
              ${
                alloc.modules.length > 0
                  ? alloc.modules
                      .map(
                        (m) => `
                    <tr>
                      <td>${escapeHTML(m.moduleCode)}</td>
                      <td>${escapeHTML(m.moduleTitle)}</td>
                      <td>${escapeHTML(m.credits)} Hrs</td>
                    </tr>
                  `
                      )
                      .join('')
                  : '<tr><td colspan="3">No modules assigned</td></tr>'
              }
            </tbody>
          </table>
        </div>
      `
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>My Teaching Allocations - ${escapeHTML(lecturerName)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 25px; color: #333; }
            h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
            .subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 25px; }
            .allocation-card { margin-bottom: 20px; page-break-inside: avoid; }
            .card-header { background: #f1f5f9; padding: 10px; font-size: 12px; border: 1px solid #cbd5e1; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; }
            th, td { border: 1px solid #ccc; padding: 7px; font-size: 12px; text-align: left; }
            th { background: #e2e8f0; }
            @media print {
              body { margin: 0; }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          </style>
        </head>
        <body>
          <h1>Teaching Workload Allocation</h1>
          <div class="subtitle">Lecturer: <strong>${escapeHTML(
            lecturerName
          )}</strong> (Staff ID: ${escapeHTML(loggedInStaffId || 'N/A')})</div>
          ${printContent}
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  // --------------------------------------------------
  // 7. RENDER UI
  // --------------------------------------------------
  if (loading) {
    return (
      <div className="p-12 text-center">
        <p className="text-base font-medium text-slate-500 animate-pulse">
          Loading your teaching module allocations...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            My Teaching Module Allocations 📚
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            View the modules, programmes, and levels assigned to you for instruction.
          </p>
        </div>

        <button
          onClick={handlePrint}
          disabled={filteredAllocations.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm disabled:opacity-50"
        >
          Print Schedule
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
          {error}
        </div>
      )}

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Allocated Programmes
            </p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {totalAllocations}
            </h3>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-lg">
            🎓
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Total Modules Assigned
            </p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">
              {totalModulesAssigned}
            </h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-lg">
            📖
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <input
          type="text"
          placeholder="Filter modules, programmes, faculties, or study levels..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </div>

      {/* ALLOCATION CARDS */}
      {filteredAllocations.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-sm font-medium">
            No teaching module allocations found.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredAllocations.map((alloc) => (
            <div
              key={alloc.id}
              className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden"
            >
              {/* CARD HEADER */}
              <div className="p-4 bg-slate-50 border-b border-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">
                      Faculty / Department
                    </p>
                    <p className="text-xs font-bold text-slate-700">
                      {alloc.faculty}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {alloc.department}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">
                      Programme & Award
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-bold text-indigo-900">
                        {alloc.programme}
                      </p>
                      {alloc.awardType && (
                        <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                          {alloc.awardType}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">
                      Academic Year
                    </p>
                    <p className="text-xs font-bold text-slate-700">
                      {alloc.academicYear}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">
                      Study Level
                    </p>
                    <p className="text-xs font-bold text-emerald-600">
                      {alloc.studyLevel}
                    </p>
                  </div>
                </div>
              </div>

              {/* MODULES TABLE */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100/70 text-slate-600 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-3 w-10">#</th>
                      <th className="p-3">Module Code</th>
                      <th className="p-3">Module Title</th>
                      <th className="p-3">Credit Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {alloc.modules.length === 0 ? (
                      <tr>
                        <td
                          colSpan="4"
                          className="p-4 text-center text-slate-400 italic"
                        >
                          No modules assigned under this allocation.
                        </td>
                      </tr>
                    ) : (
                      alloc.modules.map((module, i) => (
                        <tr
                          key={module.id || i}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-3 text-slate-400 font-mono">
                            {i + 1}
                          </td>
                          <td className="p-3 font-mono font-bold text-indigo-600">
                            {module.moduleCode}
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            {module.moduleTitle}
                          </td>
                          <td className="p-3 text-slate-500">
                            {module.credits} Hrs
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}