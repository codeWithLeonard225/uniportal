'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import {
  collection,
  onSnapshot,
} from 'firebase/firestore';

export default function ReportPage() {
  const [allocations, setAllocations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [modules, setModules] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Listen to Firebase collections in real time
  useEffect(() => {
    const collections = [
      'lecturer_module_allocations',
      'staff',
      'faculties',
      'departments',
      'programmes',
      'modules',
      'programme_modules',
    ];

    const setters = [
      setAllocations,
      setStaff,
      setFaculties,
      setDepartments,
      setProgrammes,
      setModules,
    ];

    let completed = 0;
    let hasError = false;

    const unsubscribers = collections.map((name, index) => {
      return onSnapshot(
        collection(db, name),
        (snapshot) => {
          const data = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
          }));

          if (name === 'programme_modules') {
            setModules(prev => {
              const combined = [...prev, ...data];
              return Array.from(
                new Map(combined.map(m => [m.id, m])).values()
              );
            });
          } else if (name === 'modules') {
            setters[5](prev => {
              const otherModules = prev.filter(
                m => !snapshot.docs.some(d => d.id === m.id)
              );

              return [
                ...data,
                ...otherModules,
              ];
            });
          } else {
            setters[index](data);
          }

          completed += 1;

          if (completed >= collections.length) {
            setLoading(false);
          }
        },
        (err) => {
          console.error(`Error loading ${name}:`, err);
          hasError = true;
          setError('Some report data could not be loaded.');
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, []);

  // Lookup maps
  const staffMap = useMemo(
    () => new Map(staff.map(s => [s.id, s])),
    [staff]
  );

  const facultyMap = useMemo(
    () => new Map(faculties.map(f => [f.id, f])),
    [faculties]
  );

  const departmentMap = useMemo(
    () => new Map(departments.map(d => [d.id, d])),
    [departments]
  );

  const programmeMap = useMemo(
    () => new Map(programmes.map(p => [p.id, p])),
    [programmes]
  );

  const moduleMap = useMemo(
    () => new Map(modules.map(m => [m.id, m])),
    [modules]
  );

  // Lecturer name
  const getLecturerName = (lecturerId) => {
    const teacher = staffMap.get(lecturerId);

    if (!teacher) return 'Unknown Lecturer';

    const name =
      teacher.fullName ||
      `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();

    return `${teacher.title ? teacher.title + ' ' : ''}${name || 'Unnamed Staff'}`;
  };

  // Get faculty name
  const getFacultyName = (allocation, programme) => {
    const departmentId =
      allocation.departmentId ||
      programme?.departmentId ||
      programme?.department ||
      '';

    const department = departmentMap.get(departmentId);

    const facultyId =
      allocation.facultyId ||
      programme?.facultyId ||
      programme?.faculty ||
      department?.facultyId ||
      department?.faculty ||
      '';

    const faculty = facultyMap.get(facultyId);

    return (
      faculty?.facultyName ||
      faculty?.name ||
      faculty?.title ||
      '—'
    );
  };

  // Group all allocations by lecturer
  const groupedAssignments = useMemo(() => {
    const grouped = {};

    allocations.forEach(allocation => {
      const lecturerId = allocation.lecturerId || 'unknown';

      const teacher = staffMap.get(lecturerId);

      const lecturerName = getLecturerName(lecturerId);

      const programme = programmeMap.get(allocation.programmeId);

      const programmeName =
        programme?.programmeName ||
        programme?.title ||
        programme?.name ||
        'Unknown Programme';

      // Extract awardType (Degree / Higher Diploma / Certificate etc.)
      const awardType =
        programme?.awardType ||
        programme?.award ||
        programme?.degreeType ||
        programme?.type ||
        '';

      const facultyName = getFacultyName(allocation, programme);

      const assignedModules = (allocation.moduleIds || [])
        .map(id => moduleMap.get(id))
        .filter(Boolean)
        .map(module => ({
          id: module.id,
          moduleCode: module.moduleCode || module.code || '—',
          moduleTitle:
            module.moduleTitle ||
            module.title ||
            'Untitled Module',
          credits: module.creditHours || module.credits || 3,
        }))
        .sort((a, b) =>
          a.moduleCode.localeCompare(b.moduleCode)
        );

      if (!grouped[lecturerId]) {
        grouped[lecturerId] = {
          lecturerId,
          lecturerName,
          designation: teacher?.designation || 'Lecturer',
          allocations: [],
        };
      }

      grouped[lecturerId].allocations.push({
        id: allocation.id,
        faculty: facultyName,
        programme: programmeName,
        awardType: awardType,
        academicYear: allocation.academicYear || '—',
        studyLevel: allocation.studyLevel || '—',
        semesterId: allocation.semesterId || '',
        modules: assignedModules,
      });
    });

    return grouped;
  }, [
    allocations,
    staffMap,
    programmeMap,
    moduleMap,
    departmentMap,
    facultyMap,
  ]);

  // Search lecturer, faculty, programme, award, year and modules
  const filteredTeachers = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return Object.entries(groupedAssignments)
      .filter(([lecturerId, data]) => {
        const matchesLecturer =
          data.lecturerName.toLowerCase().includes(search) ||
          lecturerId.toLowerCase().includes(search) ||
          data.designation.toLowerCase().includes(search);

        const matchesAllocation = data.allocations.some(item => {
          const allocationText = [
            item.faculty,
            item.programme,
            item.awardType,
            item.academicYear,
            item.studyLevel,
            ...item.modules.map(m => m.moduleCode),
            ...item.modules.map(m => m.moduleTitle),
          ].join(' ').toLowerCase();

          return allocationText.includes(search);
        });

        return !search || matchesLecturer || matchesAllocation;
      })
      .sort((a, b) =>
        a[1].lecturerName.localeCompare(b[1].lecturerName)
      );
  }, [groupedAssignments, searchTerm]);

  // Safe HTML escaping for print report
  const escapeHTML = (value) =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);

  // Print report
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      alert('Please allow pop-ups to print the report.');
      return;
    }

    const printContent = filteredTeachers.map(([id, teacher]) => {
      const sortedAllocations = [...teacher.allocations].sort((a, b) =>
        a.programme.localeCompare(b.programme) ||
        a.studyLevel.localeCompare(b.studyLevel)
      );

      return `
        <div class="teacher-section">

          <h3 class="teacher-title">
            Teacher: ${escapeHTML(teacher.lecturerName)}
          </h3>

          <div class="teacher-info">
            Staff ID: <strong>${escapeHTML(id)}</strong>
            &nbsp; | &nbsp;
            Designation: <strong>${escapeHTML(teacher.designation)}</strong>
          </div>

          ${sortedAllocations.map(allocation => `
            <div class="programme-section">

              <div class="programme-heading">
                <strong>Faculty:</strong> ${escapeHTML(allocation.faculty)}
                &nbsp; | &nbsp;
                <strong>Programme:</strong> ${escapeHTML(allocation.programme)} ${allocation.awardType ? `(${escapeHTML(allocation.awardType)})` : ''}
                <br/>
                <strong>Academic Year:</strong> ${escapeHTML(allocation.academicYear)}
                &nbsp; | &nbsp;
                <strong>Study Level:</strong> ${escapeHTML(allocation.studyLevel)}
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
                    allocation.modules.length > 0
                      ? allocation.modules.map(module => `
                        <tr>
                          <td>${escapeHTML(module.moduleCode)}</td>
                          <td>${escapeHTML(module.moduleTitle)}</td>
                          <td>${escapeHTML(module.credits)}</td>
                        </tr>
                      `).join('')
                      : '<tr><td colspan="3">No modules found</td></tr>'
                  }
                </tbody>
              </table>

            </div>
          `).join('')}

        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lecturer Module Allocation Report</title>

          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 30px;
              color: #333;
            }

            h1 {
              text-align: center;
              font-size: 23px;
              margin-bottom: 5px;
            }

            .report-subtitle {
              text-align: center;
              font-size: 13px;
              color: #666;
              margin-bottom: 30px;
            }

            .teacher-section {
              margin-bottom: 30px;
              page-break-inside: avoid;
            }

            .teacher-title {
              color: #1e3a8a;
              font-size: 18px;
              margin-bottom: 5px;
            }

            .teacher-info {
              font-size: 12px;
              color: #666;
              margin-bottom: 12px;
            }

            .programme-section {
              margin-bottom: 15px;
            }

            .programme-heading {
              background: #f1f5f9;
              padding: 10px;
              font-size: 12px;
              line-height: 1.8;
              border: 1px solid #cbd5e1;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 5px;
            }

            th, td {
              border: 1px solid #ccc;
              padding: 8px;
              font-size: 12px;
              text-align: left;
            }

            th {
              background: #e2e8f0;
            }

            @media print {
              body {
                margin: 0;
              }

              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          </style>
        </head>

        <body>

          <h1>Lecturer Module Allocation Report</h1>

          <div class="report-subtitle">
            Academic Staff Teaching Assignments
          </div>

          ${printContent}

          <script>
            window.onload = function() {
              window.print();
            };
          </script>

        </body>
      </html>
    `);

    printWindow.document.close();
  };

  // Statistics
  const totalTeachers = filteredTeachers.length;

  const totalProgrammes = filteredTeachers.reduce(
    (total, [, teacher]) => total + teacher.allocations.length,
    0
  );

  const totalModules = filteredTeachers.reduce(
    (total, [, teacher]) =>
      total + teacher.allocations.reduce(
        (sum, allocation) => sum + allocation.modules.length,
        0
      ),
    0
  );

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p className="text-lg font-medium text-gray-700">
          Loading lecturer allocation report...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 bg-white rounded-2xl shadow-md">

      {/* REPORT HEADER */}
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
        Lecturer Module Allocation Report
      </h2>

      <div className="text-center text-sm text-gray-500 mb-6">
        Academic Staff Teaching Assignments
      </div>

      {/* STATISTICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <p className="text-xs text-blue-700 font-semibold">
            TOTAL LECTURERS
          </p>
          <p className="text-2xl font-bold text-blue-900 mt-1">
            {totalTeachers}
          </p>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
          <p className="text-xs text-indigo-700 font-semibold">
            TOTAL PROGRAMME ALLOCATIONS
          </p>
          <p className="text-2xl font-bold text-indigo-900 mt-1">
            {totalProgrammes}
          </p>
        </div>

        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
          <p className="text-xs text-emerald-700 font-semibold">
            TOTAL MODULES
          </p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">
            {totalModules}
          </p>
        </div>

      </div>

      {/* SEARCH AND PRINT */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-3">

        <input
          type="text"
          placeholder="Search Lecturer, Staff ID, Faculty, Programme, Award or Module..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full border rounded-md px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
        />

        <button
          onClick={handlePrint}
          disabled={filteredTeachers.length === 0}
          className="w-full sm:w-auto bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Print Report
        </button>

      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* TEACHER REPORT SECTIONS */}
      {filteredTeachers.length === 0 ? (

        <p className="text-center text-gray-500 py-10">
          No lecturer allocations found matching your search.
        </p>

      ) : (

        filteredTeachers.map(([lecturerId, teacher]) => (

          <div
            key={lecturerId}
            className="mb-6 border rounded-lg p-4 bg-gray-50"
          >

            {/* TEACHER INFORMATION */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-4">

              <div>
                <h3 className="text-lg font-bold text-blue-700">
                  Teacher: {teacher.lecturerName}
                </h3>

                <p className="text-xs text-gray-500 mt-1">
                  Designation: {teacher.designation}
                </p>
              </div>

              <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-3 py-1 rounded">
                Staff ID: {lecturerId}
              </span>

            </div>

            {/* PROGRAMME ALLOCATIONS */}
            {teacher.allocations
              .slice()
              .sort((a, b) =>
                a.programme.localeCompare(b.programme) ||
                a.studyLevel.localeCompare(b.studyLevel)
              )
              .map((allocation, index) => (

                <div
                  key={allocation.id || index}
                  className="mb-5 bg-white border rounded-lg overflow-hidden"
                >

                  {/* FACULTY / PROGRAMME INFORMATION */}
                  <div className="p-3 bg-slate-100 border-b">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500">
                          Faculty
                        </p>
                        <p className="text-sm font-semibold text-gray-800">
                          {allocation.faculty}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500">
                          Programme & Award
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-indigo-700">
                            {allocation.programme}
                          </p>
                          {allocation.awardType && (
                            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200">
                              {allocation.awardType}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500">
                          Academic Year
                        </p>
                        <p className="text-sm font-medium text-gray-700">
                          {allocation.academicYear}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500">
                          Study Level
                        </p>
                        <p className="text-sm font-medium text-gray-700">
                          {allocation.studyLevel}
                        </p>
                      </div>

                    </div>

                  </div>

                  {/* MODULES TABLE */}
                  <div className="overflow-x-auto">

                    <table className="w-full text-sm border-collapse">

                      <thead className="bg-gray-200 text-gray-700">
                        <tr>
                          <th className="border px-3 py-2 text-left w-12">
                            #
                          </th>

                          <th className="border px-3 py-2 text-left">
                            Module Code
                          </th>

                          <th className="border px-3 py-2 text-left">
                            Module Title
                          </th>

                          <th className="border px-3 py-2 text-left">
                            Credit Hours
                          </th>
                        </tr>
                      </thead>

                      <tbody>

                        {allocation.modules.length === 0 ? (

                          <tr>
                            <td
                              colSpan="4"
                              className="border px-3 py-4 text-center text-gray-400"
                            >
                              No modules found for this allocation.
                            </td>
                          </tr>

                        ) : (

                          allocation.modules.map((module, i) => (

                            <tr
                              key={module.id}
                              className="hover:bg-blue-50"
                            >

                              <td className="border px-3 py-2 text-gray-500">
                                {i + 1}
                              </td>

                              <td className="border px-3 py-2 font-mono font-semibold text-blue-700">
                                {module.moduleCode}
                              </td>

                              <td className="border px-3 py-2 font-medium text-gray-800">
                                {module.moduleTitle}
                              </td>

                              <td className="border px-3 py-2 text-gray-600">
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

            {/* TEACHER SUMMARY */}
            <div className="text-right text-xs text-gray-500 mt-3">
              {teacher.allocations.length} Programme Allocation(s)
              {' • '}
              {teacher.allocations.reduce(
                (sum, item) => sum + item.modules.length,
                0
              )} Module(s) Assigned
            </div>

          </div>

        ))

      )}

      {/* FOOTER */}
      <div className="border-t pt-4 mt-6 text-center text-xs text-gray-400">
        Lecturer Module Allocation Report
      </div>

    </div>
  );
}