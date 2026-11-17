'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/app/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/app/context/AuthContext';
import { FaArrowLeft, FaArrowRight, FaPrint } from 'react-icons/fa';

// =====================================================
// CARD DIMENSIONS - SAME AS FRONT
// =====================================================
const CARD_WIDTH = '3.55in';
const CARD_HEIGHT = '2.25in';
const GAP_BETWEEN_CARDS = '0.35in';

const CARDS_PER_ROW = 2;
const ROWS_PER_PAGE = 4;
const CARDS_PER_BROWSER_PAGE = CARDS_PER_ROW * ROWS_PER_PAGE; // 8

export default function StaffIDCardBackPage() {
  const { user } = useAuth();

  // ✅ Retrieve institution ID securely from Auth Context session
  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    '';

  // ✅ Mapped precisely to your login session structure
  const schoolName = user?.institutionName || user?.schoolName || 'LeoTech Academy';
  const schoolLogoUrl = user?.logoUrl || user?.schoolLogoUrl || '';
  const schoolAddress = user?.institutionAddress || user?.schoolAddress || 'Address not found';
  const schoolMotto = user?.institutionMotto || user?.schoolMotto || 'Excellence in Education';
  const schoolContact = user?.institutionContact || user?.email || '';

  const [staffList, setStaffList] = useState([]);
  const [selectedStaffType, setSelectedStaffType] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  // =====================================================
  // FETCH STAFF FROM FIRESTORE
  // =====================================================
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') return;

    const q = query(
      collection(db, 'staff'),
      where('institutionID', '==', currentInstitutionId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setStaffList(data);
      },
      (error) => {
        console.error('Error fetching staff back records:', error);
      }
    );

    return () => unsubscribe();
  }, [currentInstitutionId]);

  // =====================================================
  // FILTER OPTIONS (Staff Type / Category)
  // =====================================================
  const staffTypeOptions = [
    'All',
    ...new Set(staffList.map((s) => s.staffType).filter(Boolean)),
  ];

  // =====================================================
  // FILTER STAFF
  // =====================================================
  const filteredStaff = staffList.filter((member) => {
    return selectedStaffType === 'All' || member.staffType === selectedStaffType;
  });

  // =====================================================
  // PAGINATION
  // =====================================================
  const totalPages =
    Math.ceil(filteredStaff.length / CARDS_PER_BROWSER_PAGE) || 1;

  const startIndex = (currentPage - 1) * CARDS_PER_BROWSER_PAGE;

  const visibleStaff = filteredStaff.slice(
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

  // =====================================================
  // PRINT
  // =====================================================
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f3f4f6',
      }}
    >
      {/* =================================================
          PRINT CSS
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
                left: 4.5px !important;
                top: 0 !important;
                display: grid !important;
                grid-template-columns: repeat(${CARDS_PER_ROW}, ${CARD_WIDTH}) !important;
                gap: ${GAP_BETWEEN_CARDS} !important;
                justify-content: center !important;
                margin: 0 !important;
                padding: 0 !important;
                width: auto !important;
                max-width: none !important;
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
          ACTION BAR
      ================================================= */}
      <div
        className="print-hidden"
        style={{
          width: '100%',
          maxWidth: '800px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '22px',
              fontWeight: 'bold',
              margin: 0,
              color: '#1e293b',
            }}
          >
            Staff ID Cards - Back Page
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
            Institution: <span style={{ fontWeight: 'bold', color: '#2563eb' }}>{schoolName}</span> ({filteredStaff.length} Staff Found)
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {/* STAFF CATEGORY FILTER */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>
              Category:
            </label>
            <select
              value={selectedStaffType}
              onChange={(e) => {
                setSelectedStaffType(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: '13px',
              }}
            >
              {staffTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* PRINT */}
          <button
            onClick={handlePrint}
            style={{
              padding: '8px 16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '600',
              fontSize: '13px',
            }}
          >
            <FaPrint />
            Print Back Page ({currentPage})
          </button>
        </div>
      </div>

      {/* =================================================
          PAGINATION CONTROLS
      ================================================= */}
      {totalPages > 1 && (
        <div
          className="print-hidden"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '15px',
            marginBottom: '20px',
          }}
        >
          <button
            onClick={handlePrevious}
            disabled={currentPage === 1}
            style={{
              padding: '6px 12px',
              background: '#d1d5db',
              color: '#1f2937',
              border: 'none',
              borderRadius: '6px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <FaArrowLeft size={12} />
            Previous
          </button>

          <span style={{ fontSize: '14px', fontWeight: '600' }}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={handleNext}
            disabled={currentPage === totalPages}
            style={{
              padding: '6px 12px',
              background: '#d1d5db',
              color: '#1f2937',
              border: 'none',
              borderRadius: '6px',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            Next
            <FaArrowRight size={12} />
          </button>
        </div>
      )}

      {/* =================================================
          BACK ID CARDS GRID
      ================================================= */}
      <div
        className="id-card-back-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${CARDS_PER_ROW}, ${CARD_WIDTH})`,
          gap: GAP_BETWEEN_CARDS,
          justifyContent: 'center',
          width: '100%',
          maxWidth: '800px',
        }}
      >
        {visibleStaff.length > 0 ? (
          visibleStaff.map((staff) => (
            <div
              key={staff.id}
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                boxSizing: 'border-box',
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: '#fff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'center',
                textAlign: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                pageBreakInside: 'avoid',
              }}
            >
              {/* Background Watermark Logo / Graphic */}
              <img
                src={schoolLogoUrl || '/images/default.png'}
                alt="Watermark"
                style={{
                  position: 'absolute',
                  top: '55px',
                  left: '105px',
                  width: '35%',
                  height: '35%',
                  objectFit: 'contain',
                  opacity: 0.08,
                  zIndex: 0,
                }}
              />

              {/* SCHOOL HEADER */}
              <div
                style={{
                  width: '90%',
                  display: 'flex',
                  position: 'relative',
                  zIndex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  paddingBottom: '4px',
                  paddingTop: '6px',
                  borderBottom: '2px solid #38BDF8',
                }}
              >
                {schoolLogoUrl && (
                  <img
                    src={schoolLogoUrl}
                    alt="School Logo"
                    style={{
                      width: '32px',
                      height: '32px',
                      objectFit: 'contain',
                    }}
                  />
                )}

                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: '11px',
                    color: '#181a1b',
                    textTransform: 'uppercase',
                    lineHeight: '1.1',
                  }}
                >
                  {schoolName}
                </div>
              </div>

              {/* MAIN MESSAGE */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '2px 10px',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 'bold',
                    color: '#1f2937',
                    marginBottom: '3px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  IMPORTANT NOTICE
                </div>

                <div
                  style={{
                    fontSize: '9.5px',
                    fontWeight: '600',
                    lineHeight: '1.3',
                    color: '#111827',
                  }}
                >
                  THIS ID CARD REMAINS THE PROPERTY OF
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: '#2563eb',
                    marginTop: '2px',
                    lineHeight: '1.2',
                    textTransform: 'uppercase',
                  }}
                >
                  {schoolName}
                </div>

                <div
                  style={{
                    marginTop: '3px',
                    fontSize: '8.5px',
                    fontWeight: '600',
                    lineHeight: '1.2',
                    color: '#374151',
                  }}
                >
                  IF FOUND, PLEASE RETURN TO THE INSTITUTION OR NEAREST POLICE STATION.
                </div>
              </div>

              {/* CONTACT / FOOTER */}
              <div
                style={{
                  width: '100%',
                  borderTop: '1px solid #e2e8f0',
                  padding: '4px 6px',
                  fontSize: '8.5px',
                  color: '#475569',
                  lineHeight: '1.3',
                  position: 'relative',
                  zIndex: 1,
                  background: '#f8fafc',
                }}
              >
                {schoolAddress && <div style={{ truncate: 'true' }}>{schoolAddress}</div>}
                {schoolContact && <div>Contact: {schoolContact}</div>}
                {schoolMotto && (
                  <div style={{ fontStyle: 'italic', marginTop: '1px', fontWeight: '500', color: '#64748b' }}>
                    "{schoolMotto}"
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              gridColumn: 'span 2',
              textAlign: 'center',
              padding: '40px',
              background: '#fff',
              borderRadius: '12px',
              border: '1px dashed #cbd5e1',
              color: '#64748b',
              fontSize: '14px',
            }}
          >
            No registered staff members found for Institution: <span style={{ fontWeight: 'bold', color: '#2563eb' }}>{schoolName}</span>
          </div>
        )}
      </div>
    </div>
  );
}