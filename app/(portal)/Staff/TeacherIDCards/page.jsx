'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/app/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/app/context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';

// Print Layout Constants (Standard CR80 ID Card & A4 Grid Layout)
const CARDS_PER_ROW = 2;
const CARD_WIDTH = '3.375in'; // Standard CR80 ID Card Width
const GAP_BETWEEN_CARDS = '0.25in';


export default function TeacherIDCardsPage() {
  const { user } = useAuth();

  // ✅ Retrieve institution ID securely from Auth Context session
  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    '';

  // ✅ Mapped precisely to the updated login session structure
  const schoolName = user?.institutionName || user?.schoolName || 'LeoTech Academy';
  const schoolLogoUrl = user?.logoUrl || user?.schoolLogoUrl || '';
  const schoolAddress = user?.institutionAddress || user?.schoolAddress || 'Address not found';
  const schoolMotto = user?.institutionMotto || user?.schoolMotto || 'Excellence in Education';

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Fetch staff records strictly filtered by institutionID ---
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') {
      setLoading(false);
      return;
    }

    const fetchStaffCards = async () => {
      try {
        const q = query(
          collection(db, 'staff'),
          where('institutionID', '==', currentInstitutionId)
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setTeachers(list);
      } catch (err) {
        console.error('Error fetching staff ID cards:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStaffCards();
  }, [currentInstitutionId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-12 space-y-3">
        <div className="w-10 h-10 rounded-xl border-4 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-xs font-bold text-slate-600 tracking-wide">
          Loading Staff ID Card Templates...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-slate-100 flex flex-col items-center">
      {/* PRINT CSS OVERRIDES */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          .cards-container, .cards-container * {
            visibility: visible !important;
          }

          .cards-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            display: grid !important;
            grid-template-columns: repeat(${CARDS_PER_ROW}, ${CARD_WIDTH}) !important;
            gap: ${GAP_BETWEEN_CARDS} !important;
            justify-content: center !important;
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

      {/* Action Bar */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-6 print:hidden">
        <div>
          <h1 className="text-xl font-black text-slate-800">Staff ID Cards Generator</h1>
          <p className="text-xs text-slate-500">
            Institution: <span className="font-bold text-indigo-600">{schoolName}</span> ({teachers.length} Staff Members Found)
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-5 py-2.5 rounded-xl font-extrabold shadow-md transition flex items-center gap-2 cursor-pointer"
        >
          <span>Print All ID Cards</span> 🖨️
        </button>
      </div>

      {/* ID Cards Container */}
      <div className="cards-container grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {teachers.map((teacher) => {
          const qrPayload = teacher.staffId || '';
          const staffName = `${teacher.title || ''} ${teacher.fullName || 'Staff Member'}`.trim();

          return (
            <div
              key={teacher.id}
              className="w-[3.375in] h-[2.125in] bg-white border border-slate-300 rounded-xl shadow-md overflow-hidden flex flex-col justify-between relative print:shadow-none print:border-slate-400 mx-auto"
              style={{ pageBreakInside: 'avoid' }}
            >
              {/* Card Top Banner (School Branded) */}
              <div className="bg-white px-3 py-1 flex items-center justify-between border-b-2 border-indigo-500">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {schoolLogoUrl ? (
                    <img
                      src={schoolLogoUrl}
                      alt="Logo"
                      className="w-7 h-7 object-contain rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 bg-indigo-600 text-white rounded flex items-center justify-center text-[10px] font-black flex-shrink-0">
                      {schoolName.charAt(0)}
                    </div>
                  )}

                  <div className="overflow-hidden min-w-0">
                    <h2
                      className="text-[11px] font-black tracking-tight leading-none uppercase truncate text-slate-900"
                      title={schoolName}
                    >
                      {schoolName}
                    </h2>
                    <p className="text-[9px] text-slate-500 truncate leading-none italic mt-0.5">
                      {schoolMotto}
                    </p>
                  </div>
                </div>

                <span className="bg-indigo-600 text-[8px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider text-white flex-shrink-0">
                  {teacher.staffType || 'STAFF'}
                </span>
              </div>

              {/* Main Body */}
              <div className="px-3 flex gap-3 items-center flex-1 py-1">
                {/* Staff Passport Photo */}
                <div className="w-[0.95in] h-[1.15in] bg-slate-100 rounded-lg overflow-hidden border border-slate-300 flex-shrink-0 shadow-inner">
                  {teacher.passportPhotoUrl ? (
                    <img
                      src={teacher.passportPhotoUrl}
                      alt={staffName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[9px] text-slate-400 text-center p-1">
                      No Photo
                    </div>
                  )}
                </div>

                {/* Details & Role */}
                <div className="flex-1 min-w-0 flex flex-col justify-center text-left space-y-1">
                  <div>
                    {/* Full Name Uncut (Removed truncate / line-clamp) */}
                    <h3 className="text-[10.5px] font-black text-slate-900 leading-tight break-words">
                      {staffName}
                    </h3>
                    <p className="text-[9px] text-indigo-600 font-extrabold uppercase tracking-wide truncate">
                      {teacher.designation || 'Lecturer'}
                    </p>
                  </div>

                  <div className="text-[8.5px] text-slate-600 space-y-0.5 border-t border-slate-100 pt-1">
                    <p className="leading-tight flex justify-between">
                      <span className="font-bold text-slate-500">Staff ID:</span>
                      <span className="font-mono font-bold text-slate-900">{teacher.staffId}</span>
                    </p>
                    <p className="leading-tight flex justify-between">
                      <span className="font-bold text-slate-500">Gender:</span>
                      <span className="font-medium text-slate-800">{teacher.gender || 'N/A'}</span>
                    </p>
                    <p className="leading-tight flex justify-between">
                      <span className="font-bold text-slate-500">Phone:</span>
                      <span className="font-medium text-slate-800">{teacher.phone || 'N/A'}</span>
                    </p>
                  </div>
                </div>

                {/* QR Code Verification */}
                <div className="flex flex-col items-center justify-center bg-slate-50 p-1 rounded-lg border border-slate-200 flex-shrink-0">
                  <QRCodeSVG value={qrPayload} size={50} level="M" />
                  <span className="text-[6.5px] font-extrabold text-slate-500 mt-0.5 uppercase tracking-wider">
                    VERIFY
                  </span>
                </div>
              </div>

              {/* Card Footer (Status removed, displaying address cleanly) */}
              <div className="bg-slate-900 text-slate-300 px-3 py-1 flex justify-between items-center text-[8.5px]">
                <span className="truncate w-full">{schoolAddress}</span>
              </div>
            </div>
          );
        })}

        {teachers.length === 0 && (
          <div className="col-span-2 text-center text-slate-500 py-12 bg-white rounded-2xl border border-dashed border-slate-300">
            No registered staff members found for Institution: <span className="font-bold text-indigo-600">{schoolName}</span>
          </div>
        )}
      </div>
    </div>
  );
}