'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
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

export default function StudentAttendanceScannerPage() {
  const { user } = useAuth();

  // Retrieve institution ID from Auth Context or fallback session storage
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

  // State Management
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
  const fetchStudents = async () => {
    if (!schoolId) return;
    try {
      const q = query(
        collection(db, 'students'),
        where('institutionID', '==', schoolId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setStudentList(list);
    } catch (err) {
      console.error('Error fetching students:', err);
      alert('Could not load student list.');
    }
  };

  const handleOpenManualModal = () => {
    fetchStudents();
    setShowManualModal(true);
  };

  // Time-based status rules for students
  const getClockInStatus = (now) => {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const ATTENDANCE_START = 6 * 60 + 30; // 6:30 AM
    const PRESENT_END = 8 * 60 + 15; // 8:15 AM
    const LATE_END = 9 * 60; // 9:00 AM
    const ABSENT_END = 15 * 60; // 3:00 PM

    if (currentMinutes < ATTENDANCE_START) {
      return {
        status: 'Not Started',
        allowed: false,
        reason: 'Student attendance check-in has not started yet.',
      };
    }

    if (currentMinutes < PRESENT_END) {
      return { status: 'Present', allowed: true, reason: '' };
    }

    if (currentMinutes < LATE_END) {
      return { status: 'Late', allowed: true, reason: '' };
    }

    if (currentMinutes < ABSENT_END) {
      return {
        status: 'Absent',
        allowed: false,
        reason: 'Check-in recorded after cutoff hours. Student marked Absent.',
      };
    }

    return {
      status: 'Absent',
      allowed: false,
      reason: 'Student check-in is closed for the day.',
    };
  };

  // Initialize QR Scanner
  useEffect(() => {
    if (!schoolId) return;

    const html5QrCode = new Html5Qrcode('student-reader-viewfinder');
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
          });
      });

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current
          .stop()
          .catch((e) => console.error('Stop failed', e));
      }
    };
  }, [schoolId]);

  const isAttendanceLocked = (record) => {
    return record?.isFinal === true;
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
      // Supports both plain string studentId (from StudentIDCardsPage) and JSON payload
      let parsedData;
      try {
        parsedData = JSON.parse(rawText);
      } catch {
        parsedData = { studentId: rawText.trim() };
      }

      const studentId = (
        parsedData?.studentId ||
        parsedData?.studentID ||
        rawText.trim()
      ).trim();

      if (!studentId) {
        alert('Invalid student QR Code.');
        return;
      }

      // Find student in Firestore
      const studentQuery = query(
        collection(db, 'students'),
        where('studentId', '==', studentId),
        where('institutionID', '==', schoolId)
      );
      const studentSnap = await getDocs(studentQuery);

      if (studentSnap.empty) {
        setScannedResult({
          name: 'Unknown Student',
          subInfo: '--',
          status: 'Student Not Found',
          time: '--',
          note: `No student record found with ID ${studentId}.`,
          isError: true,
        });
        return;
      }

      const studentData = studentSnap.docs[0].data();
      const studentName = `${studentData.title || ''} ${
        studentData.fullName || 'Student'
      }`.trim();
      const subInfo = `${studentData.programmeName || 'General'} • ${
        studentData.studyLevel || ''
      }`.trim();

      // Check student account status
      if (studentData.status && studentData.status !== 'Active') {
        setScannedResult({
          name: studentName,
          subInfo,
          status: `Blocked: Status is ${studentData.status}`,
          time: '--',
          note: 'Only Active students can log daily attendance.',
          isError: true,
        });
        return;
      }

      const now = new Date();
      const todayStr = now.toLocaleDateString('en-CA');
      const timeStr = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const currentMode = attendanceTypeRef.current;

      const attendanceId = `${schoolId}_${studentId}_${todayStr}`;
      const attendanceRef = doc(db, 'StudentAttendance', attendanceId);
      const attendanceSnap = await getDoc(attendanceRef);

      // CLOCK-IN
      if (currentMode === 'clock-in') {
        if (attendanceSnap.exists()) {
          const existing = attendanceSnap.data();
          if (isAttendanceLocked(existing)) {
            setScannedResult({
              name: studentName,
              subInfo,
              status: `Blocked: Finalized (${existing.status})`,
              time: existing.clockInTime || '--',
              note: existing.note || 'Attendance has been finalized.',
              isError: true,
            });
            return;
          }

          if (existing.clockOutTime) {
            setScannedResult({
              name: studentName,
              subInfo,
              status: 'Blocked: Already Checked Out',
              time: existing.clockOutTime,
              note: 'Student cannot check in again after checking out.',
              isError: true,
            });
            return;
          }

          setScannedResult({
            name: studentName,
            subInfo,
            status: `Already Checked In (${existing.status})`,
            time: existing.clockInTime || '--',
            note: existing.note || null,
            isError: true,
          });
          return;
        }

        const { status: derivedStatus, allowed, reason } = getClockInStatus(now);

        if (!allowed) {
          if (derivedStatus === 'Not Started') {
            setScannedResult({
              name: studentName,
              subInfo,
              status: 'Attendance Not Started',
              time: timeStr,
              note: reason,
              isError: true,
            });
            return;
          }

          await setDoc(attendanceRef, {
            studentId: studentData.studentId,
            studentName,
            programmeId: studentData.programmeId || '',
            programmeName: studentData.programmeName || '',
            studyLevel: studentData.studyLevel || '',
            institutionID: schoolId,
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

          setScannedResult({
            name: studentName,
            subInfo,
            status: 'Absent - Check-In Closed',
            time: '--',
            note: reason,
            isError: true,
          });
          return;
        }

        await setDoc(attendanceRef, {
          studentId: studentData.studentId,
          studentName,
          programmeId: studentData.programmeId || '',
          programmeName: studentData.programmeName || '',
          studyLevel: studentData.studyLevel || '',
          institutionID: schoolId,
          date: todayStr,
          clockInTime: timeStr,
          clockOutTime: null,
          status: derivedStatus,
          note: '',
          isFinal: false,
          timestamp: serverTimestamp(),
        });

        setScannedResult({
          name: studentName,
          subInfo,
          status: `Checked In (${derivedStatus})`,
          time: timeStr,
          note: null,
          isError: false,
        });
      }

      // CLOCK-OUT
      else if (currentMode === 'clock-out') {
        if (!attendanceSnap.exists()) {
          setScannedResult({
            name: studentName,
            subInfo,
            status: 'Blocked: No Check-In Record',
            time: '--',
            note: 'Student has not checked in today.',
            isError: true,
          });
          return;
        }

        const existing = attendanceSnap.data();
        if (isAttendanceLocked(existing)) {
          setScannedResult({
            name: studentName,
            subInfo,
            status: 'Blocked: Attendance Finalized',
            time: existing.clockOutTime || existing.clockInTime || '--',
            note: existing.note || null,
            isError: true,
          });
          return;
        }

        if (existing.clockOutTime) {
          setScannedResult({
            name: studentName,
            subInfo,
            status: 'Already Checked Out',
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
          name: studentName,
          subInfo,
          status: 'Checked Out Successfully',
          time: timeStr,
          note: null,
          isError: false,
        });
      }

      // EXCUSE / LEAVE
      else if (currentMode === 'excuse' || currentMode === 'leave') {
        const targetStatus = currentMode === 'excuse' ? 'Excused' : 'On Leave';

        const notePrompt = window.prompt(
          `Enter reason for ${targetStatus} for ${studentName}:`
        );
        if (!notePrompt || !notePrompt.trim()) {
          alert('Reason note is required.');
          return;
        }

        await setDoc(attendanceRef, {
          studentId: studentData.studentId,
          studentName,
          programmeId: studentData.programmeId || '',
          programmeName: studentData.programmeName || '',
          studyLevel: studentData.studyLevel || '',
          institutionID: schoolId,
          date: todayStr,
          clockInTime: null,
          clockOutTime: null,
          status: targetStatus,
          note: notePrompt.trim(),
          isFinal: true,
          finalizedBy: 'scan',
          finalizedAt: serverTimestamp(),
          timestamp: serverTimestamp(),
        });

        setScannedResult({
          name: studentName,
          subInfo,
          status: targetStatus,
          time: timeStr,
          note: notePrompt.trim(),
          isError: false,
        });
      }
    } catch (err) {
      console.error('Scan processing error:', err);
      setScannedResult({
        name: 'System Error',
        subInfo: '--',
        status: 'Processing Failed',
        time: '--',
        note: err.message || 'Unknown error occurred.',
        isError: true,
      });
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

  // Manual Attendance Submission
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) {
      alert('Please select a student.');
      return;
    }

    setIsSavingManual(true);
    try {
      const studentMember = studentList.find(
        (s) => s.id === selectedStudentId || s.studentId === selectedStudentId
      );
      if (!studentMember) {
        alert('Selected student not found.');
        return;
      }

      const studentName = `${studentMember.title || ''} ${
        studentMember.fullName || 'Student'
      }`.trim();
      const now = new Date();
      const todayStr = now.toLocaleDateString('en-CA');
      const timeStr = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      const attendanceId = `${schoolId}_${studentMember.studentId}_${todayStr}`;
      const attendanceRef = doc(db, 'StudentAttendance', attendanceId);
      const attendanceSnap = await getDoc(attendanceRef);

      if (manualAction === 'clock-in') {
        const { status: derivedStatus } = getClockInStatus(now);
        await setDoc(attendanceRef, {
          studentId: studentMember.studentId,
          studentName,
          programmeId: studentMember.programmeId || '',
          programmeName: studentMember.programmeName || '',
          studyLevel: studentMember.studyLevel || '',
          institutionID: schoolId,
          date: todayStr,
          clockInTime: timeStr,
          clockOutTime: null,
          status: derivedStatus,
          note: manualNote.trim(),
          isFinal: false,
          entryType: 'manual',
          timestamp: serverTimestamp(),
        });
      } else if (manualAction === 'clock-out') {
        if (!attendanceSnap.exists()) {
          alert('Student has not checked in today.');
          setIsSavingManual(false);
          return;
        }
        await updateDoc(attendanceRef, {
          clockOutTime: timeStr,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(attendanceRef, {
          studentId: studentMember.studentId,
          studentName,
          programmeId: studentMember.programmeId || '',
          programmeName: studentMember.programmeName || '',
          studyLevel: studentMember.studyLevel || '',
          institutionID: schoolId,
          date: todayStr,
          clockInTime: null,
          clockOutTime: null,
          status: manualAction,
          note: manualNote.trim(),
          isFinal: true,
          entryType: 'manual',
          finalizedBy: 'manual',
          finalizedAt: serverTimestamp(),
          timestamp: serverTimestamp(),
        });
      }

      alert(`Successfully recorded manual attendance for ${studentName}!`);
      setShowManualModal(false);
      setSelectedStudentId('');
      setManualNote('');
    } catch (err) {
      console.error('Manual attendance error:', err);
      alert('Failed to save manual attendance.');
    } finally {
      setIsSavingManual(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 font-sans bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
            Institutional Student Tracking
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">
            Student QR Code Attendance Scanner
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {schoolName} • Institution ID:{' '}
            <span className="font-mono font-bold text-slate-700">{schoolId}</span>
          </p>
        </div>

        <button
          onClick={handleOpenManualModal}
          className="bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Manual Entry Form</span> 📝
        </button>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { id: 'clock-in', label: 'Check In 📥' },
          { id: 'clock-out', label: 'Check Out 📤' },
          { id: 'excuse', label: 'Excused 📝' },
          { id: 'leave', label: 'On Leave 🌴' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setAttendanceType(tab.id)}
            className={`py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs ${
              attendanceType === tab.id
                ? 'bg-indigo-600 text-white shadow-md scale-[1.02]'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scanner & Result Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* QR Scanner Viewfinder */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col items-center">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4">
            Live Scanner ({attendanceType.replace('-', ' ').toUpperCase()})
          </h2>
          <div
            id="student-reader-viewfinder"
            className="w-full max-w-[300px] h-[300px] bg-slate-900 rounded-2xl overflow-hidden border-4 border-slate-200 shadow-inner"
          />
          <p className="text-[11px] text-slate-400 mt-4 text-center font-medium">
            Position student QR ID card within the viewfinder frame.
          </p>
        </div>

        {/* Scan Result Feedback Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
              Scan Feedback Log
            </h2>

            {scannedResult ? (
              <div
                className={`p-5 rounded-2xl border ${
                  scannedResult.isError
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                } space-y-3 shadow-xs`}
              >
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-70 block">
                    Student Name
                  </span>
                  <h3 className="text-base font-black uppercase">
                    {scannedResult.name}
                  </h3>
                  {scannedResult.subInfo && (
                    <p className="text-[11px] font-semibold opacity-80">
                      {scannedResult.subInfo}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-current/10 text-xs">
                  <div>
                    <span className="font-semibold opacity-70 block text-[10px]">
                      STATUS
                    </span>
                    <strong className="font-black">{scannedResult.status}</strong>
                  </div>
                  <div>
                    <span className="font-semibold opacity-70 block text-[10px]">
                      TIME
                    </span>
                    <strong className="font-mono">{scannedResult.time}</strong>
                  </div>
                </div>

                {scannedResult.note && (
                  <div className="pt-2 border-t border-current/10 text-xs">
                    <span className="font-semibold opacity-70 block text-[10px]">
                      NOTE / REASON
                    </span>
                    <p className="italic">{scannedResult.note}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                <span className="text-3xl block mb-2">🎓</span>
                <p className="text-xs font-bold uppercase tracking-wider">
                  Waiting for student scan...
                </p>
              </div>
            )}
          </div>

          {isProcessing && (
            <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl text-xs font-bold text-center animate-pulse">
              Processing student attendance...
            </div>
          )}
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-slate-100 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase">
                  Manual Student Attendance
                </h3>
                <p className="text-xs text-slate-500">
                  Override or record student attendance manually
                </p>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Select Student
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                  required
                >
                  <option value="">-- Choose Student --</option>
                  {studentList.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.title || ''} {student.fullName} ({student.studentId}) -{' '}
                      {student.studyLevel || 'Student'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Attendance Action
                </label>
                <select
                  value={manualAction}
                  onChange={(e) => setManualAction(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                >
                  <option value="clock-in">Check In</option>
                  <option value="clock-out">Check Out</option>
                  <option value="Excused">Excused</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Absent">Absent</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Notes / Reason
                </label>
                <textarea
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Optional notes or reason..."
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 outline-none h-24 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-xs uppercase tracking-widest transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-2xl text-xs uppercase tracking-widest shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSavingManual && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{isSavingManual ? 'Saving...' : 'Save Record'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}