'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { GradeAndAttendance } from '@/app/lib/gradeAttendanceFirebase';
import { useAuth } from '@/app/context/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { MdAssessment, MdCheckCircle, MdError, MdSchool } from 'react-icons/md';

export default function StudentSemesterResultsPage() {
  const { user } = useAuth();

  // Resolve local storage or context user data
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

  const institutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    localUserData?.institutionID ||
    localUserData?.schoolId ||
    '';

  const studentId =
    user?.studentId ||
    user?.studentID ||
    user?.data?.studentId ||
    user?.data?.studentID ||
    localUserData?.studentId ||
    localUserData?.studentID ||
    '';

  const [studentGrades, setStudentGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSemester, setSelectedSemester] = useState('All');

  // Fetch grades in real-time strictly for this student ID and institution ID
  useEffect(() => {
    if (!institutionId || !studentId) {
      setLoading(false);
      return;
    }

    const qGrades = query(
      collection(GradeAndAttendance, 'exams_grades'),
      where('institutionID', '==', institutionId),
      where('studentId', '==', studentId)
    );

    const unsubscribe = onSnapshot(
      qGrades,
      (snapshot) => {
        const results = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        // Sort by most recently updated or academic year
        results.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setStudentGrades(results);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching student exam results:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [institutionId, studentId]);

  // Extract unique semesters available for this student
  const availableSemesters = useMemo(() => {
    const sems = studentGrades.map((g) => g.semesterName || g.semesterId).filter(Boolean);
    return ['All', ...Array.from(new Set(sems))];
  }, [studentGrades]);

  const filteredGrades = useMemo(() => {
    if (selectedSemester === 'All') return studentGrades;
    return studentGrades.filter(
      (g) => (g.semesterName || g.semesterId) === selectedSemester
    );
  }, [studentGrades, selectedSemester]);

  // Calculate Cumulative/Semester GPA
  const gpaSummary = useMemo(() => {
    if (filteredGrades.length === 0) return { gpa: '0.00', totalCourses: 0 };
    
    let totalPoints = 0;
    let validCount = 0;

    filteredGrades.forEach((g) => {
      const gp = Number(g.gradePoint);
      if (!isNaN(gp)) {
        totalPoints += gp;
        validCount += 1;
      }
    });

    const avg = validCount > 0 ? (totalPoints / validCount).toFixed(2) : '0.00';
    return { gpa: avg, totalCourses: filteredGrades.length };
  }, [filteredGrades]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center p-12 space-y-3">
        <div className="w-8 h-8 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-xs font-bold text-slate-500">Loading your verified semester results...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      {/* Header & Filter */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <MdAssessment className="text-indigo-600" />
            <span>My Semester Results</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Official published examination grades and grade points for Student ID: <span className="font-mono font-bold text-slate-700">{studentId || 'N/A'}</span>
          </p>
        </div>

        {availableSemesters.length > 1 && (
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <label className="text-xs font-bold text-slate-600">Filter Term:</label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              {availableSemesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Modules Graded</p>
          <h3 className="text-2xl font-black text-slate-800 mt-1">{gpaSummary.totalCourses}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Calculated Average GPA</p>
          <h3 className="text-2xl font-black text-indigo-600 mt-1 font-mono">{gpaSummary.gpa}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Student Verification ID</p>
          <h3 className="text-sm font-bold text-slate-800 mt-2 font-mono truncate">{studentId}</h3>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Published Grade Records</h3>
        </div>

        {filteredGrades.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No published grades found for your student ID yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                  <th className="p-4">Module Code &amp; Title</th>
                  <th className="p-4">Academic Year &amp; Semester</th>
                  {/* <th className="p-4 text-center">Score</th> */}
                  <th className="p-4 text-center">Grade</th>
                  <th className="p-4 text-center">Grade Point</th>
                  <th className="p-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGrades.map((gradeItem) => (
                  <tr key={gradeItem.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{gradeItem.courseCode}</div>
                      <div className="text-[11px] text-slate-500">{gradeItem.courseTitle}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-slate-800">{gradeItem.academicYear || '2025/2026'}</div>
                      <div className="text-[10px] text-slate-400">{gradeItem.semesterName || 'Semester'}</div>
                    </td>
                    {/* <td className="p-4 text-center font-mono font-bold text-slate-800">
                      {gradeItem.score}
                    </td> */}
                    <td className="p-4 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-lg font-mono font-black text-[11px] ${
                        gradeItem.gradeStatus === 'A' || gradeItem.gradeStatus === 'B'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : gradeItem.gradeStatus === 'C' || gradeItem.gradeStatus === 'D'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {gradeItem.gradeStatus || '—'}
                      </span>
                    </td>
                    <td className="p-4 text-center font-mono font-bold text-indigo-600">
                      {gradeItem.gradePoint !== undefined && gradeItem.gradePoint !== null
                        ? Number(gradeItem.gradePoint).toFixed(2)
                        : '0.00'}
                    </td>
                    <td className="p-4 text-slate-600 italic">
                      {gradeItem.remarks || 'No remarks'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}