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
import { FaPrint, FaTrash, FaCalendarAlt, FaSearch } from 'react-icons/fa';

export default function StaffAttendanceRecordsPage() {
  const { user } = useAuth();

  // Retrieve institution ID from Auth Context or stored session
  const [localUserData, setLocalUserData] = useState(null);

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem('schoolUser') ||
        localStorage.getItem('user') ||
        localStorage.getItem('authUser') ||
        localStorage.getItem('session');
      if (stored) setLocalUserData(JSON.parse(stored));
    } catch (e) {
      console.error('Error loading session:', e);
    }
  }, []);

  const schoolId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    localUserData?.institutionID ||
    localUserData?.schoolId ||
    '';

  const schoolName =
    user?.institutionName ||
    user?.schoolName ||
    localUserData?.institutionName ||
    'LeoTech Academy';

  const [attendanceList, setAttendanceList] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toLocaleDateString('en-CA');
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // ============================================================
  // 1. LOAD ALL STAFF
  // ============================================================
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    const staffQuery = query(
      collection(db, 'staff'),
      where('institutionID', '==', schoolId)
    );

    const unsubscribe = onSnapshot(
      staffQuery,
      (snapshot) => {
        const staff = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAllStaff(staff);
      },
      (err) => {
        console.error('Error loading staff:', err);
      }
    );

    return () => unsubscribe();
  }, [schoolId]);

  // ============================================================
  // 2. LOAD ATTENDANCE FOR SELECTED DATE
  // ============================================================
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const attendanceQuery = query(
      collection(db, 'StaffAttendance'),
      where('institutionID', '==', schoolId),
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
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [schoolId, selectedDate]);

  // ============================================================
  // 3. DELETE ONE ATTENDANCE RECORD
  // ============================================================
  const handleDeleteRecord = async (id, staffName) => {
    if (
      !window.confirm(
        `Delete attendance record for ${staffName || 'this staff member'}?`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'StaffAttendance', id));
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete record.');
    }
  };

  const handleClearAllForDate = async () => {
    alert(
      '⚠️ Attendance records cannot be bulk cleared for data safety. Please delete individual entries if needed.'
    );
  };

  // ============================================================
  // 4. DETERMINE ATTENDANCE STATUS
  // ============================================================
  const getAttendanceStatus = (record) => {
    if (record.status) {
      const normalized = record.status.trim().toLowerCase();
      if (normalized === 'leave' || normalized === 'on leave') return 'Leave';
      if (normalized === 'excused' || normalized === 'excuse') return 'Excused';
      if (normalized === 'present') return 'Present';
      if (normalized === 'absent') return 'Absent';
      if (normalized === 'late') return 'Late';
      if (normalized === 'clocked out') return 'Clocked Out';
      return record.status;
    }

    if (record.clockInTime && record.clockOutTime) return 'Clocked Out';
    if (record.clockInTime && !record.clockOutTime) return 'Present';
    return 'Absent';
  };

  // ============================================================
  // 5. BUILD DISPLAY LIST (Combines Staff & Attendance)
  // ============================================================
  const getDisplayAttendance = () => {
    if (attendanceList.length === 0) {
      return [];
    }

    const attendanceMap = new Map();
    attendanceList.forEach((record) => {
      if (record.staffId) {
        attendanceMap.set(String(record.staffId), record);
      }
    });

    const displayRecords = allStaff.map((staff) => {
      const staffIdKey = String(staff.staffId || staff.id || '');
      const existingRecord = attendanceMap.get(staffIdKey);
      const fullName = `${staff.title || ''} ${staff.fullName || staff.name || 'Staff Member'}`.trim();

      if (existingRecord) {
        return {
          ...existingRecord,
          teacherName: existingRecord.staffName || fullName,
          isAutomaticallyAbsent: false,
        };
      }

      return {
        id: `absent-${staff.id}`,
        staffId: staff.staffId || '---',
        teacherName: fullName,
        date: selectedDate,
        clockInTime: null,
        clockOutTime: null,
        status: 'Absent',
        isAutomaticallyAbsent: true,
        isManual: false,
      };
    });

    // Apply search filter if any
    if (!searchTerm.trim()) return displayRecords;
    return displayRecords.filter(
      (item) =>
        item.teacherName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.staffId?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const displayAttendance = getDisplayAttendance();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 min-h-screen bg-slate-100 flex flex-col items-center font-sans">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .printable-report,
          .printable-report * {
            visibility: visible !important;
          }
          .printable-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-hidden {
            display: none !important;
          }
          @page {
            size: A4 landscape;
            margin: 0.5in;
          }
        }
      `}</style>

      {/* Main Container */}
      <div className="printable-report bg-white shadow-xs rounded-3xl p-8 w-full max-w-6xl border border-slate-200">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-100 pb-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              {schoolName}
            </span>
            <h1 className="text-2xl font-black text-slate-900 mt-0.5">
              Staff Daily Attendance Report 📊
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Institution ID: <span className="font-mono font-bold text-slate-700">{schoolId}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 print-hidden">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
              <FaCalendarAlt className="text-slate-400 text-xs" />
              <label className="text-xs font-bold text-slate-600">Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={handlePrint}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-5 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              <FaPrint /> Print Report
            </button>
          </div>
        </div>

        {/* Search & Stats Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 print-hidden">
          <div className="relative w-full sm:w-72">
            <FaSearch className="absolute left-3.5 top-3.5 text-slate-400 text-xs" />
            <input
              type="text"
              placeholder="Search staff name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
            <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-100">
              Total Records: {displayAttendance.length}
            </span>
          </div>
        </div>

        {/* Info Banner if No Records */}
        {!loading && attendanceList.length === 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-5 py-4 rounded-2xl text-xs font-medium">
            ℹ️ No attendance logs recorded for <strong className="font-bold">{selectedDate}</strong>. Staff members will appear as automatically absent once attendance logging begins for this date.
          </div>
        )}

        {/* Attendance Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3.5 text-left">Staff ID</th>
                <th className="px-4 py-3.5 text-left">Staff Details</th>
                <th className="px-4 py-3.5 text-left">Date</th>
                <th className="px-4 py-3.5 text-left text-emerald-700">Clock-In</th>
                <th className="px-4 py-3.5 text-left text-red-700">Clock-Out</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-center print-hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center text-slate-500 font-bold">
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Loading attendance report...
                    </div>
                  </td>
                </tr>
              ) : displayAttendance.length > 0 ? (
                displayAttendance.map((record) => {
                  const status = getAttendanceStatus(record);
                  const isManual = record.isManual || record.entryType === 'manual' || record.finalizedBy === 'manual';
                  const noteText = record.note || record.excuseNote || record.reason;

                  return (
                    <tr
                      key={record.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        record.isAutomaticallyAbsent ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-700">
                        {record.staffId || record.teacherID || '---'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-extrabold text-slate-900">
                          {record.teacherName || 'Unnamed Staff'}
                        </div>
                        {record.isAutomaticallyAbsent && (
                          <span className="inline-block mt-0.5 text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            Auto Absent
                          </span>
                        )}
                        {isManual && !record.isAutomaticallyAbsent && (
                          <span className="inline-block mt-0.5 text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                            ✏️ Manual Entry
                          </span>
                        )}
                        {noteText && (
                          <div className="mt-1 text-[10px] text-amber-800 bg-amber-50 p-1 rounded border border-amber-200 italic max-w-xs">
                            <span className="font-bold not-italic">Note:</span> {noteText}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-medium">
                        {record.date}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-600">
                        {record.clockInTime ? (
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-200">
                            {record.clockInTime}
                          </span>
                        ) : (
                          <span className="text-slate-300">---</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-red-600">
                        {record.clockOutTime ? (
                          <span className="bg-red-50 text-red-700 px-2 py-1 rounded-md border border-red-200">
                            {record.clockOutTime}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">Not Clocked Out</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {status === 'Present' && (
                          <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            ● Present
                          </span>
                        )}
                        {status === 'Late' && (
                          <span className="bg-amber-100 text-amber-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            ⚠️ Late
                          </span>
                        )}
                        {status === 'Clocked Out' && (
                          <span className="bg-blue-100 text-blue-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            ✓ Clocked Out
                          </span>
                        )}
                        {status === 'Absent' && (
                          <span className="bg-rose-100 text-rose-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            ✕ Absent
                          </span>
                        )}
                        {status === 'Leave' && (
                          <span className="bg-purple-100 text-purple-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            🌴 On Leave
                          </span>
                        )}
                        {status === 'Excused' && (
                          <span className="bg-indigo-100 text-indigo-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            📝 Excused
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center print-hidden">
                        {!record.isAutomaticallyAbsent && (
                          <button
                            onClick={() => handleDeleteRecord(record.id, record.teacherName)}
                            className="text-red-600 hover:text-white hover:bg-red-600 bg-red-50 border border-red-200 p-2 rounded-xl transition-all cursor-pointer"
                            title="Delete Record"
                          >
                            <FaTrash size={10} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center text-slate-400 font-bold">
                    No attendance records found for <span className="text-slate-700">{selectedDate}</span>.
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