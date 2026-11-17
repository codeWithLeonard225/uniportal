'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/app/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { useAuth } from '@/app/context/AuthContext';
import { toast } from 'react-toastify';

export default function StudentAttendanceRecords() {
  const { user } = useAuth();

  // ✅ Retrieve institution ID securely from Auth Context session
  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    'N/A';

  const [attendanceList, setAttendanceList] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toLocaleDateString('en-CA');
  });

  // Optional filters for Student Directory report
  const [selectedLevel, setSelectedLevel] = useState('All');
  const [selectedProgramme, setSelectedProgramme] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(true);

  /*
   * ============================================================
   * 1. LOAD ALL STUDENTS (Filtered by institutionID)
   * ============================================================
   */
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') {
      return;
    }

    const studentsQuery = query(
      collection(db, 'students'),
      where('institutionID', '==', currentInstitutionId)
    );

    const unsubscribe = onSnapshot(
      studentsQuery,
      (snapshot) => {
        const students = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAllStudents(students);
      },
      (err) => {
        console.error('Error loading students:', err);
        toast.error('Failed to load student records.');
      }
    );

    return () => unsubscribe();
  }, [currentInstitutionId]);

  /*
   * ============================================================
   * 2. LOAD STUDENT ATTENDANCE FOR SELECTED DATE
   * ============================================================
   */
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') {
      setLoading(false);
      return;
    }

    setLoading(true);

    const attendanceQuery = query(
      collection(db, 'StudentAttendance'),
      where('institutionID', '==', currentInstitutionId),
      where('date', '==', selectedDate)
    );

    const unsubscribe = onSnapshot(
      attendanceQuery,
      (snapshot) => {
        const records = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        setAttendanceList(records);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading attendance logs:', err);
        toast.error('Failed to fetch student attendance logs.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentInstitutionId, selectedDate]);

  /*
   * ============================================================
   * 3. DELETE ONE ATTENDANCE RECORD
   * ============================================================
   */
  const handleDeleteRecord = async (id, studentName) => {
    if (
      !window.confirm(
        `Delete attendance record for ${studentName || 'this student'}?`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'StudentAttendance', id));
      toast.success(`Deleted record for ${studentName || 'student'}`);
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to delete record.');
    }
  };

  /*
   * ============================================================
   * 4. CLEAR ALL GUARD
   * ============================================================
   */
  const handleClearAllForDate = async () => {
    alert(
      '⚠️ Attendance records cannot be cleared directly. Please contact the system administrator for attendance corrections.'
    );
  };

  /*
   * ============================================================
   * 5. DETERMINE ATTENDANCE STATUS
   * ============================================================
   */
  const getAttendanceStatus = (record) => {
    if (record.status) {
      const normalized = record.status.trim().toLowerCase();

      if (normalized === 'leave' || normalized === 'on leave') {
        return 'Leave';
      }

      if (normalized === 'excused' || normalized === 'excuse') {
        return 'Excused';
      }

      if (normalized === 'present') {
        return 'Present';
      }

      if (normalized === 'absent') {
        return 'Absent';
      }

      if (normalized === 'late') {
        return 'Late';
      }

      if (normalized === 'clocked out') {
        return 'Clocked Out';
      }

      return record.status;
    }

    if (record.clockInTime && record.clockOutTime) {
      return 'Clocked Out';
    }

    if (record.clockInTime && !record.clockOutTime) {
      return 'Present';
    }

    return 'Absent';
  };

  /*
   * ============================================================
   * 6. BUILD DISPLAY LIST
   * ============================================================
   */
  const getDisplayAttendance = () => {
    if (attendanceList.length === 0) {
      return [];
    }

    const attendanceMap = new Map();

    attendanceList.forEach((record) => {
      const keyId = record.studentId;
      if (keyId) {
        attendanceMap.set(String(keyId), record);
      }
    });

    const displayRecords = allStudents.map((student) => {
      const studentIdentifier = String(student.studentId || student.id || '');
      const existingRecord = attendanceMap.get(studentIdentifier);
      const studentFullName = `${student.title || ''} ${student.fullName || 'Unnamed Student'}`.trim();

      if (existingRecord) {
        return {
          ...existingRecord,
          studentName: existingRecord.studentName || studentFullName,
          studyLevel: student.studyLevel || 'N/A',
          programmeName: student.programmeName || 'General',
          isAutomaticallyAbsent: false,
        };
      }

      return {
        id: `absent-${student.id}`,
        studentId: student.studentId || '---',
        studentName: studentFullName,
        studyLevel: student.studyLevel || 'N/A',
        programmeName: student.programmeName || 'General',
        date: selectedDate,
        clockInTime: null,
        clockOutTime: null,
        status: 'Absent',
        isAutomaticallyAbsent: true,
        isManual: false,
      };
    });

    // Apply search & dropdown filters
    return displayRecords.filter((item) => {
      const matchesSearch =
        item.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.studentId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLevel =
        selectedLevel === 'All' || item.studyLevel === selectedLevel;
      const matchesProgramme =
        selectedProgramme === 'All' || item.programmeName === selectedProgramme;

      return matchesSearch && matchesLevel && matchesProgramme;
    });
  };

  const displayAttendance = getDisplayAttendance();

  // Dynamic Filter Options
  const levelOptions = [
    'All',
    ...new Set(allStudents.map((s) => s.studyLevel).filter(Boolean)),
  ];
  const programmeOptions = [
    'All',
    ...new Set(allStudents.map((s) => s.programmeName).filter(Boolean)),
  ];

  // Quick Summary Counts
  const summaryCounts = displayAttendance.reduce(
    (acc, rec) => {
      const st = getAttendanceStatus(rec);
      if (st === 'Present' || st === 'Clocked Out') acc.present += 1;
      else if (st === 'Late') acc.late += 1;
      else if (st === 'Excused' || st === 'Leave') acc.excused += 1;
      else acc.absent += 1;
      return acc;
    },
    { present: 0, late: 0, excused: 0, absent: 0 }
  );

  return (
    <div className="p-6 min-h-screen bg-gray-100 flex flex-col items-center">
      <div className="bg-white shadow-md rounded-2xl p-6 w-full max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Daily Student Attendance Records 📊
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Institution ID:{' '}
              <span className="text-indigo-600 font-mono font-bold">
                {currentInstitutionId}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {attendanceList.length > 0 && (
              <button
                onClick={handleClearAllForDate}
                className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                🗑️ Clear All ({attendanceList.length})
              </button>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">
                Filter Date:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Summary Metrics Bar (Visible when attendance exists) */}
        {!loading && attendanceList.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <div className="text-lg font-black text-emerald-700">{summaryCounts.present}</div>
              <div className="text-[11px] font-bold text-emerald-600 uppercase">Present / Out</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
              <div className="text-lg font-black text-orange-700">{summaryCounts.late}</div>
              <div className="text-[11px] font-bold text-orange-600 uppercase">Late</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <div className="text-lg font-black text-amber-700">{summaryCounts.excused}</div>
              <div className="text-[11px] font-bold text-amber-600 uppercase">Excused / Leave</div>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
              <div className="text-lg font-black text-rose-700">{summaryCounts.absent}</div>
              <div className="text-[11px] font-bold text-rose-600 uppercase">Absent</div>
            </div>
          </div>
        )}

        {/* Filter Controls */}
        {attendanceList.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
            <input
              type="text"
              placeholder="Search student name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="p-2 border rounded-lg text-xs bg-white w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={selectedProgramme}
              onChange={(e) => setSelectedProgramme(e.target.value)}
              className="p-2 border rounded-lg text-xs bg-white w-full sm:w-auto"
            >
              {programmeOptions.map((prog) => (
                <option key={prog} value={prog}>
                  {prog === 'All' ? 'All Programmes' : prog}
                </option>
              ))}
            </select>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="p-2 border rounded-lg text-xs bg-white w-full sm:w-auto"
            >
              {levelOptions.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl === 'All' ? 'All Study Levels' : lvl}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Information message when nobody has recorded attendance */}
        {!loading && attendanceList.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
            ℹ️ No student attendance has been recorded for{' '}
            <span className="font-semibold">{selectedDate}</span>. Students are not marked
            absent until at least one attendance record is logged for this day.
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Student ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Student Details
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Programme / Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-green-700 uppercase tracking-wider">
                  Clock-In
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                  Clock-Out
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-sm text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      Loading logs...
                    </div>
                  </td>
                </tr>
              ) : displayAttendance.length > 0 ? (
                displayAttendance.map((record) => {
                  const status = getAttendanceStatus(record);
                  const isManual = record.isManual || record.entryType === 'manual';
                  const noteText = record.note || record.excuseNote || record.reason;
                  const displayStudentId = record.studentId || '---';

                  return (
                    <tr
                      key={record.id}
                      className={`hover:bg-gray-50 transition-colors ${
                        record.isAutomaticallyAbsent ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      {/* Student ID */}
                      <td className="px-4 py-3 text-sm font-mono font-bold text-gray-900">
                        {displayStudentId}
                      </td>

                      {/* Student Details */}
                      <td className="px-4 py-3 text-sm">
                        <div className="font-bold text-gray-800">
                          {record.studentName || 'Unnamed Student'}
                        </div>

                        {record.isAutomaticallyAbsent && (
                          <span className="inline-block mt-0.5 text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 font-medium">
                            Automatically marked absent
                          </span>
                        )}

                        {isManual && !record.isAutomaticallyAbsent && (
                          <span className="inline-block mt-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                            ✏️ Manual Entry
                          </span>
                        )}

                        {noteText && (
                          <div className="mt-1 text-xs text-amber-700 bg-amber-50 p-1.5 rounded-md border border-amber-200 italic max-w-xs">
                            <span className="font-semibold not-italic">Note:</span> {noteText}
                          </div>
                        )}
                      </td>

                      {/* Programme & Level */}
                      <td className="px-4 py-3 text-xs">
                        <div className="font-semibold text-gray-700">{record.programmeName}</div>
                        <div className="text-[10px] text-indigo-600 font-mono">{record.studyLevel}</div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-sm text-gray-500">{record.date}</td>

                      {/* Clock In */}
                      <td className="px-4 py-3 text-sm font-semibold text-green-600">
                        {record.clockInTime ? (
                          <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md text-xs border border-green-200 font-mono">
                            {record.clockInTime}
                          </span>
                        ) : (
                          <span className="text-gray-400">---</span>
                        )}
                      </td>

                      {/* Clock Out */}
                      <td className="px-4 py-3 text-sm font-semibold text-red-600">
                        {record.clockOutTime ? (
                          <span className="bg-red-50 text-red-700 px-2 py-1 rounded-md text-xs border border-red-200 font-mono">
                            {record.clockOutTime}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Not Clocked Out</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-sm text-center">
                        {status === 'Present' && (
                          <span className="bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-1 rounded-full text-xs">
                            ● Present
                          </span>
                        )}
                        {status === 'Late' && (
                          <span className="bg-orange-100 text-orange-800 font-semibold px-2.5 py-1 rounded-full text-xs">
                            ⚠️ Late
                          </span>
                        )}
                        {status === 'Clocked Out' && (
                          <span className="bg-blue-100 text-blue-800 font-semibold px-2.5 py-1 rounded-full text-xs">
                            ✓ Clocked Out
                          </span>
                        )}
                        {status === 'Absent' && (
                          <span className="bg-rose-100 text-rose-800 font-semibold px-2.5 py-1 rounded-full text-xs">
                            ✕ Absent
                          </span>
                        )}
                        {status === 'Leave' && (
                          <span className="bg-purple-100 text-purple-800 font-semibold px-2.5 py-1 rounded-full text-xs">
                            ✈️ On Leave
                          </span>
                        )}
                        {status === 'Excused' && (
                          <span className="bg-amber-100 text-amber-800 font-semibold px-2.5 py-1 rounded-full text-xs">
                            📝 Excused
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-sm text-center">
                        {!record.isAutomaticallyAbsent && (
                          <button
                            onClick={() =>
                              handleDeleteRecord(record.id, record.studentName)
                            }
                            className="text-red-600 hover:text-red-900 font-medium text-xs bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded transition cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="px-6 py-10 text-center text-sm text-gray-500">
                    No student attendance records found for{' '}
                    <span className="font-semibold text-gray-700">{selectedDate}</span>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}