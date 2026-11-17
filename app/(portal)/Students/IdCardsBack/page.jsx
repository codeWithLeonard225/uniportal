'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/app/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/app/context/AuthContext';
import { FaArrowLeft, FaArrowRight, FaPrint } from 'react-icons/fa';

// =====================================================
// CARD DIMENSIONS - CR80 STANDARD (MATCHING FRONT)
// =====================================================
const CARD_WIDTH = '3.375in';
const CARD_HEIGHT = '2.125in';
const GAP_BETWEEN_CARDS = '0.25in';

const CARDS_PER_ROW = 2;
const ROWS_PER_PAGE = 4;
const CARDS_PER_BROWSER_PAGE = CARDS_PER_ROW * ROWS_PER_PAGE; // 8 cards per A4 page

export default function StudentIDCardBackPage() {
  const { user } = useAuth();

  // ✅ Retrieve institution ID securely from Auth Context session
  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    '';

  const schoolName = user?.institutionName || user?.schoolName || 'LeoTech Academy';
  const schoolLogoUrl = user?.logoUrl || user?.schoolLogoUrl || '';
  const schoolAddress = user?.institutionAddress || user?.schoolAddress || 'Address not found';
  const schoolMotto = user?.institutionMotto || user?.schoolMotto || 'Excellence in Education';
  const schoolContact = user?.institutionContact || user?.email || '';

  const [studentList, setStudentList] = useState([]);
  const [selectedStudyLevel, setSelectedStudyLevel] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // =====================================================
  // FETCH STUDENTS FROM FIRESTORE ('students' collection)
  // =====================================================
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'students'),
      where('institutionID', '==', currentInstitutionId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setStudentList(data);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching student back records:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentInstitutionId]);

  // =====================================================
  // FILTER OPTIONS (Study Level)
  // =====================================================
  const studyLevelOptions = [
    'All',
    ...new Set(studentList.map((s) => s.studyLevel).filter(Boolean)),
  ];

  // =====================================================
  // FILTER STUDENTS
  // =====================================================
  const filteredStudents = studentList.filter((student) => {
    return selectedStudyLevel === 'All' || student.studyLevel === selectedStudyLevel;
  });

  // =====================================================
  // PAGINATION
  // =====================================================
  const totalPages =
    Math.ceil(filteredStudents.length / CARDS_PER_BROWSER_PAGE) || 1;

  const startIndex = (currentPage - 1) * CARDS_PER_BROWSER_PAGE;

  const visibleStudents = filteredStudents.slice(
    startIndex,
    startIndex + CARDS_PER_BROWSER_PAGE
  );

  const handleNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-12 space-y-3">
        <div className="w-10 h-10 rounded-xl border-4 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-xs font-bold text-slate-600 tracking-wide">
          Loading Student ID Back Templates...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-slate-100 flex flex-col items-center">
      {/* =================================================
          PRINT CSS OVERRIDES
      ================================================= */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          .id-card-back-grid,
          .id-card-back-grid * {
            visibility: visible !important;
          }

          .id-card-back-grid {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            display: grid !important;
            grid-template-columns: repeat(${CARDS_PER_ROW}, ${CARD_WIDTH}) !important;
            gap: ${GAP_BETWEEN_CARDS} !important;
            justify-content: center !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          .print-hidden {
            display: none !important;
          }

          @page {
            size: A4 portrait;
            margin: 0.4in;
          }

          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            background: white !important;
            overflow: visible !important;
          }
        }
      `}</style>

      {/* =================================================
          ACTION BAR (Hidden on Print)
      ================================================= */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-6 print-hidden flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-800">
            Student ID Cards Generator (Back)
          </h1>
          <p className="text-xs text-slate-500">
            Institution: <span className="font-bold text-indigo-600">{schoolName}</span> ({filteredStudents.length} Students Found)
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* STUDY LEVEL FILTER */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <label className="text-xs font-bold text-slate-600">Level:</label>
            <select
              value={selectedStudyLevel}
              onChange={(e) => {
                setSelectedStudyLevel(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs font-medium bg-transparent outline-none text-slate-800 cursor-pointer"
            >
              {studyLevelOptions.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          {/* PRINT BUTTON */}
          <button
            onClick={handlePrint}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-5 py-2.5 rounded-xl font-extrabold shadow-md transition flex items-center gap-2 cursor-pointer"
          >
            <FaPrint /> Print Back Page ({currentPage})
          </button>
        </div>
      </div>

      {/* =================================================
          PAGINATION CONTROLS
      ================================================= */}
      {totalPages > 1 && (
        <div className="print-hidden flex justify-center items-center gap-4 mb-6">
          <button
            onClick={handlePrevious}
            disabled={currentPage === 1}
            className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <FaArrowLeft size={10} /> Previous
          </button>

          <span className="text-xs font-bold text-slate-600">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={handleNext}
            disabled={currentPage === totalPages}
            className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 flex items-center gap-2 shadow-sm cursor-pointer"
          >
            Next <FaArrowRight size={10} />
          </button>
        </div>
      )}

      {/* =================================================
          BACK ID CARDS GRID
      ================================================= */}
      <div className="id-card-back-grid grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {visibleStudents.length > 0 ? (
          visibleStudents.map((student) => (
            <div
              key={student.id}
              className="w-[3.375in] h-[2.125in] bg-white border border-slate-300 rounded-xl shadow-md overflow-hidden flex flex-col justify-between relative print:shadow-none print:border-slate-400 mx-auto box-border"
              style={{ pageBreakInside: 'avoid' }}
            >
              {/* Background Watermark Logo */}
              {schoolLogoUrl && (
                <img
                  src={schoolLogoUrl}
                  alt="Watermark"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 object-contain opacity-5 pointer-events-none z-0"
                />
              )}

              {/* School Header Banner */}
              <div className="bg-white px-3 py-1.5 flex items-center justify-center gap-2 border-b-2 border-indigo-500 relative z-10">
                {schoolLogoUrl ? (
                  <img
                    src={schoolLogoUrl}
                    alt="Logo"
                    className="w-6 h-6 object-contain rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 bg-indigo-600 text-white rounded flex items-center justify-center text-[9px] font-black flex-shrink-0">
                    {schoolName.charAt(0)}
                  </div>
                )}
                <h2
                  className="text-[11px] font-black tracking-tight leading-none uppercase truncate text-slate-900"
                  title={schoolName}
                >
                  {schoolName}
                </h2>
              </div>

              {/* Terms & Conditions / Important Notice */}
              <div className="flex-1 flex flex-col justify-center items-center px-4 text-center relative z-10 my-auto">
                <h3 className="text-[9px] font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                  IMPORTANT NOTICE
                </h3>
                <p className="text-[8.5px] font-semibold leading-snug text-slate-700">
                  This ID card remains the property of <strong className="text-indigo-700 uppercase">{schoolName}</strong>.
                </p>
                <p className="text-[8px] font-medium leading-tight text-slate-500 mt-1">
                  If found, please return this card to the administration office or the nearest police station.
                </p>
              </div>

              {/* Card Footer / Contact Details */}
              <div className="bg-slate-900 text-slate-300 px-3 py-1.5 flex flex-col justify-center text-[7.5px] leading-tight relative z-10">
                <p className="truncate text-center font-medium">{schoolAddress}</p>
                <div className="flex justify-between items-center mt-0.5 text-[7px] text-slate-400 border-t border-slate-800 pt-0.5">
                  <span className="truncate">Contact: {schoolContact || 'Support Desk'}</span>
                  <span className="italic">{schoolMotto}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-2 text-center text-slate-500 py-12 bg-white rounded-2xl border border-dashed border-slate-300">
            No registered student records found for Institution: <span className="font-bold text-indigo-600">{schoolName}</span>
          </div>
        )}
      </div>
    </div>
  );
}