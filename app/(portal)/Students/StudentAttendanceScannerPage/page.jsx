'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '@/app/lib/firebase';
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '@/app/context/AuthContext';
import { toast } from 'react-toastify';
import { FaQrcode, FaUserGraduate, FaTimesCircle, FaCheckCircle } from 'react-icons/fa';

export default function StudentAttendanceScanner() {
  const { user } = useAuth();

  // ✅ Retrieve institution ID securely from Auth Context session
  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    '';

  const [attendanceType, setAttendanceType] = useState('clock-in'); // "clock-in" | "clock-out" | "excuse" | "leave"
  const [scannedResult, setScannedResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Manual Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [studentList, setStudentList] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [manualAction, setManualAction] = useState('clock-in');
  const [manualNote, setManualNote] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  const html5QrCodeRef = useRef(null);
  const attendanceTypeRef = useRef(attendanceType);

  useEffect(() => {
    attendanceTypeRef.current = attendanceType;
  }, [attendanceType]);

  // Fetch students list for manual selection
  const fetchStudentList = async () => {
    if (!currentInstitutionId) return;
    try {
      const q = query(collection(db, 'students'), where('institutionID', '==', currentInstitutionId));
      const snap = await getDocs(q);
      const list = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStudentList(list);
    } catch (err) {
      console.error('Error fetching student list:', err);
      toast.error('Could not load student list.');
    }
  };

  const handleOpenManualModal = () => {
    fetchStudentList();
    setShowManualModal(true);
  };

  // Helper: Determine status based on current time
  const getClockInStatus = (now) => {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const ATTENDANCE_START = 6 * 60 + 30; // 6:30 AM
    const PRESENT_END = 8 * 60;          // 8:00 AM
    const LATE_END = 8 * 60 + 30;         // 8:30 AM
    const ABSENT_END = 14 * 60;           // 2:00 PM

    if (currentMinutes < ATTENDANCE_START) {
      return {
        status: 'Not Started',
        allowed: false,
        reason: 'Student attendance has not started yet.',
      };
    }

    if (currentMinutes < PRESENT_END) {
      return {
        status: 'Present',
        allowed: true,
        reason: '',
      };
    }

    if (currentMinutes < LATE_END) {
      return {
        status: 'Late',
        allowed: true,
        reason: '',
      };
    }

    return {
      status: 'Absent',
      allowed: false,
      reason: 'Clock-in recorded after hours. Student marked Absent.',
    };
  };

  useEffect(() => {
    if (!currentInstitutionId) return;

    const html5QrCode = new Html5Qrcode('reader-viewfinder');
    html5QrCodeRef.current = html5QrCode;

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode
      .start(
        { facingMode: { exact: 'environment' } },
        config,
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {}
      )
      .catch(() => {
        html5QrCode
          .start(
            { facingMode: 'environment' },
            config,
            (decodedText) => {
              handleScanSuccess(decodedText);
            },
            () => {}
          )
          .catch((fallbackErr) => {
            console.error('Failed to start camera:', fallbackErr);
            toast.error('Could not access the camera. Please use manual entry.');
          });
      });

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch((e) => console.error('Stop failed', e));
      }
    };
  }, [currentInstitutionId]);

  const isAttendanceLocked = (record) => {
    return record?.isFinal === true;
  };

  const processAttendanceRecord = async (studentId, mode, customNote = '') => {
    try {
      // 1. Find Student Member in 'students' collection
      const studentQ = query(
        collection(db, 'students'),
        where('studentId', '==', studentId),
        where('institutionID', '==', currentInstitutionId)
      );

      const studentSnap = await getDocs(studentQ);

      if (studentSnap.empty) {
        toast.error(`Student ID ${studentId} not found in this institution.`);
        setScannedResult({
          name: 'Unknown Student',
          status: 'Student Not Found',
          time: '--',
          note: `No student record found with ID ${studentId}.`,
          isError: true,
        });
        return;
      }

      const studentData = studentSnap.docs[0].data();
      const studentFullName = `${studentData.title || ''} ${studentData.fullName || 'Student'}`.trim();

      const now = new Date();
      const todayStr = now.toLocaleDateString('en-CA');
      const timeStr = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      const attendanceId = `${currentInstitutionId}_${studentId}_${todayStr}`;
      const attendanceRef = doc(db, 'StudentAttendance', attendanceId);
      const attendanceSnap = await getDoc(attendanceRef);

      // ================= CLOCK-IN =================
      if (mode === 'clock-in') {
        if (attendanceSnap.exists()) {
          const existing = attendanceSnap.data();

          if (isAttendanceLocked(existing)) {
            toast.error(`🚫 ${studentFullName} already has finalized attendance (${existing.status}).`);
            setScannedResult({
              name: studentFullName,
              status: `Blocked: Finalized (${existing.status})`,
              time: existing.clockInTime || '--',
              note: existing.note || 'Attendance has been finalized.',
              isError: true,
            });
            return;
          }

          if (existing.clockOutTime) {
            toast.error(`🚫 ${studentFullName} already clocked out today at ${existing.clockOutTime}.`);
            setScannedResult({
              name: studentFullName,
              status: 'Blocked: Already Clocked Out',
              time: existing.clockOutTime,
              note: 'Student cannot clock in again after clocking out.',
              isError: true,
            });
            return;
          }

          toast.warning(`⚠️ ${studentFullName} is already clocked in at ${existing.clockInTime || '--'}.`);
          setScannedResult({
            name: studentFullName,
            status: `Already Clocked In (${existing.status})`,
            time: existing.clockInTime || '--',
            note: existing.note || null,
            isError: true,
          });
          return;
        }

        const { status: derivedStatus, allowed, reason } = getClockInStatus(now);

        if (!allowed && derivedStatus === 'Not Started') {
          toast.warning(`⏰ Student attendance has not started yet.`);
          setScannedResult({
            name: studentFullName,
            status: 'Attendance Not Started',
            time: timeStr,
            note: reason,
            isError: true,
          });
          return;
        }

        if (!allowed) {
          await setDoc(attendanceRef, {
            studentId: studentData.studentId,
            studentName: studentFullName,
            institutionID: currentInstitutionId,
            date: todayStr,
            clockInTime: null,
            clockOutTime: null,
            status: 'Absent',
            note: reason,
            isFinal: true,
            finalizedBy: 'system',
            finalizedAt: serverTimestamp(),
            timestamp: serverTimestamp(),
          });

          toast.error(`❌ ${studentFullName} marked ABSENT.`);
          setScannedResult({
            name: studentFullName,
            status: 'Absent - Clock-In Closed',
            time: '--',
            note: reason,
            isError: true,
          });
          return;
        }

        await setDoc(attendanceRef, {
          studentId: studentData.studentId,
          studentName: studentFullName,
          institutionID: currentInstitutionId,
          date: todayStr,
          clockInTime: timeStr,
          clockOutTime: null,
          status: derivedStatus,
          note: '',
          isFinal: false,
          timestamp: serverTimestamp(),
        });

        setScannedResult({
          name: studentFullName,
          status: `Clocked In (${derivedStatus})`,
          time: timeStr,
          note: null,
          isError: false,
        });

        if (derivedStatus === 'Late') {
          toast.warning(`⚠️ ${studentFullName} Clocked IN LATE at ${timeStr}`);
        } else {
          toast.success(`✅ ${studentFullName} Clocked IN at ${timeStr}`);
        }
      }

      // ================= CLOCK-OUT =================
      else if (mode === 'clock-out') {
        if (!attendanceSnap.exists()) {
          toast.error(`🚫 ${studentFullName} cannot clock out without a clock-in record.`);
          setScannedResult({
            name: studentFullName,
            status: 'Blocked: No Clock-In Record',
            time: '--',
            note: 'Student has not clocked in today.',
            isError: true,
          });
          return;
        }

        const existing = attendanceSnap.data();

        if (isAttendanceLocked(existing)) {
          toast.error(`🚫 ${studentFullName} attendance has already been finalized.`);
          setScannedResult({
            name: studentFullName,
            status: 'Blocked: Finalized Attendance',
            time: existing.clockOutTime || existing.clockInTime || '--',
            note: existing.note || null,
            isError: true,
          });
          return;
        }

        if (existing.clockOutTime) {
          toast.warning(`⚠️ ${studentFullName} already clocked out at ${existing.clockOutTime}.`);
          setScannedResult({
            name: studentFullName,
            status: 'Already Clocked Out',
            time: existing.clockOutTime,
            note: existing.note || null,
            isError: true,
          });
          return;
        }

        await updateDoc(attendanceRef, {
          clockOutTime: timeStr,
          updatedAt: serverTimestamp(),
        });

        setScannedResult({
          name: studentFullName,
          status: 'Clocked Out Successfully',
          time: timeStr,
          note: null,
          isError: false,
        });

        toast.success(`🚪 ${studentFullName} Clocked OUT at ${timeStr}`);
      }

      // ================= EXCUSE / LEAVE =================
      else if (mode === 'excuse' || mode === 'leave') {
        const targetStatus = mode === 'excuse' ? 'Excused' : 'On Leave';

        if (attendanceSnap.exists()) {
          const existing = attendanceSnap.data();
          if (isAttendanceLocked(existing)) {
            toast.warning(`⚠️ ${studentFullName} already has finalized attendance.`);
            return;
          }
        }

        const reasonNote = customNote || prompt(`Enter reason for ${targetStatus} for ${studentFullName}:`);
        if (!reasonNote || !reasonNote.trim()) {
          toast.error('Reason note is required.');
          return;
        }

        await setDoc(attendanceRef, {
          studentId: studentData.studentId,
          studentName: studentFullName,
          institutionID: currentInstitutionId,
          date: todayStr,
          clockInTime: null,
          clockOutTime: null,
          status: targetStatus,
          note: reasonNote.trim(),
          isFinal: true,
          finalizedBy: 'scanner',
          finalizedAt: serverTimestamp(),
          timestamp: serverTimestamp(),
        });

        setScannedResult({
          name: studentFullName,
          status: targetStatus,
          time: timeStr,
          note: reasonNote.trim(),
          isError: false,
        });

        toast.success(`✅ ${studentFullName} marked ${targetStatus}`);
      }
    } catch (err) {
      console.error('Attendance processing error:', err);
      toast.error('Error logging student attendance.');
    }
  };

  const handleScanSuccess = async (rawText) => {
    if (isProcessing) return;
    setIsProcessing(true);

    if (html5QrCodeRef.current) {
      try {
        html5QrCodeRef.current.pause(true);
      } catch (e) {
        console.error('Pause failed:', e);
      }
    }

    try {
      let parsedData;
      try {
        parsedData = JSON.parse(rawText);
      } catch {
        parsedData = { studentId: rawText.trim() };
      }

      const studentId = parsedData?.studentId?.trim() || rawText.trim();
      if (!studentId) {
        toast.error('Invalid student QR Code.');
        return;
      }

      await processAttendanceRecord(studentId, attendanceTypeRef.current);
    } finally {
      setTimeout(() => {
        if (html5QrCodeRef.current) {
          try {
            html5QrCodeRef.current.resume();
          } catch (e) {
            console.error('Resume failed:', e);
          }
        }
        setIsProcessing(false);
      }, 1500);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) {
      toast.error('Please select a student.');
      return;
    }

    setIsSavingManual(true);
    try {
      await processAttendanceRecord(selectedStudentId, manualAction, manualNote);
      setShowManualModal(false);
      setSelectedStudentId('');
      setManualNote('');
    } finally {
      setIsSavingManual(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <FaQrcode className="text-indigo-600" /> Student Attendance Scanner
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Institution ID: <span className="font-mono font-bold text-indigo-600">{currentInstitutionId || 'N/A'}</span>
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setAttendanceType('clock-in')}
            className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
              attendanceType === 'clock-in' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Clock In
          </button>
          <button
            onClick={() => setAttendanceType('clock-out')}
            className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
              attendanceType === 'clock-out' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Clock Out
          </button>
          <button
            onClick={() => setAttendanceType('excuse')}
            className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
              attendanceType === 'excuse' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Excuse
          </button>
          <button
            onClick={() => setAttendanceType('leave')}
            className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
              attendanceType === 'leave' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leave
          </button>
        </div>
      </div>

      {/* Main Scanner & Result Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Camera Viewfinder Box */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
          <div className="w-full flex justify-between items-center mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Camera Viewfinder</span>
            <button
              onClick={handleOpenManualModal}
              className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Manual Entry 📝
            </button>
          </div>

          <div id="reader-viewfinder" className="w-full max-w-[320px] h-[280px] bg-slate-900 rounded-xl overflow-hidden border border-slate-300 shadow-inner flex items-center justify-center text-slate-400 text-xs">
            Initializing Scanner...
          </div>
          <p className="text-[11px] text-slate-400 mt-3 text-center">
            Position student QR code inside the frame to log attendance automatically.
          </p>
        </div>

        {/* Scan Result Feedback Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Latest Scan Result</h2>

            {scannedResult ? (
              <div
                className={`p-5 rounded-2xl border ${
                  scannedResult.isError
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                } space-y-3 shadow-sm`}
              >
                <div className="flex items-center gap-3">
                  {scannedResult.isError ? (
                    <FaTimesCircle className="text-rose-600 text-2xl flex-shrink-0" />
                  ) : (
                    <FaCheckCircle className="text-emerald-600 text-2xl flex-shrink-0" />
                  )}
                  <div>
                    <h3 className="font-black text-base">{scannedResult.name}</h3>
                    <p className="text-xs font-bold uppercase tracking-wide opacity-80">{scannedResult.status}</p>
                  </div>
                </div>

                <div className="border-t border-current/10 pt-2 flex justify-between text-xs font-mono">
                  <span>Timestamp:</span>
                  <span className="font-bold">{scannedResult.time}</span>
                </div>

                {scannedResult.note && (
                  <p className="text-xs italic opacity-90 bg-white/60 p-2 rounded-lg">
                    "{scannedResult.note}"
                  </p>
                )}
              </div>
            ) : (
              <div className="h-[180px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center">
                <FaUserGraduate className="text-3xl mb-2 opacity-40" />
                <p className="text-xs font-bold">Waiting for scan...</p>
                <p className="text-[10px] opacity-75 mt-0.5">Scanned student details will appear here instantly.</p>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Mode: <strong className="text-slate-700 uppercase">{attendanceType.replace('-', ' ')}</strong></span>
            <span>Status: <strong className="text-emerald-600">Active</strong></span>
          </div>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-5">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-lg text-slate-800">Manual Student Attendance Entry</h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 ring-indigo-500"
                  required
                >
                  <option value="">-- Choose Student --</option>
                  {studentList.map((student) => (
                    <option key={student.id} value={student.studentId}>
                      {student.title || ''} {student.fullName} ({student.studentId}) - {student.studyLevel || 'Student'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Action Type</label>
                <select
                  value={manualAction}
                  onChange={(e) => setManualAction(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 ring-indigo-500"
                >
                  <option value="clock-in">Clock In</option>
                  <option value="clock-out">Clock Out</option>
                  <option value="excuse">Excuse</option>
                  <option value="leave">On Leave</option>
                </select>
              </div>

              {(manualAction === 'excuse' || manualAction === 'leave') && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason Note</label>
                  <input
                    type="text"
                    placeholder="Enter reason..."
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 ring-indigo-500"
                    required
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingManual ? 'Saving...' : 'Submit Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}