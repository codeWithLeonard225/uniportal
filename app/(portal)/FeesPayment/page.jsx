'use client';
// app/(portal)/Institution/FeesPayment/page.jsx
import React, { useState, useEffect } from 'react';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

// --- Cloudinary Configuration Constants ---
const CLOUD_NAME = "us1rsa1j";
const UPLOAD_PRESET = "LeotechProject2";
const MAX_FILE_SIZE_MB = 2;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"];

const PAYMENT_METHODS = [
  'Bank Deposit Slip',
  'Cash',
  'Bank Transfer',
  'Mobile Money (Orange/Africell)',
  'Credit/Debit Card',
  'Cheque',
  'Scholarship / Sponsor',
];

const PAYMENT_TYPES = [
  'Tuition Fee',
  'Registration Fee',
  'Examination Fee',
  'Library Fee',
  'Development Levy',
  'Hostel / Accommodation',
  'Other / Miscellaneous',
];

// --- Helper: Generate Transaction Receipt ID ---
const generateReceiptNo = () => {
  const chars = "0123456789";
  let result = "REC";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function FeesPaymentPage() {
  const { user } = useAuth();

  // ✅ Retrieve institutionID from Auth Context session
  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    '';

  // --- Initial Form State ---
  const initialFormState = {
    receiptNo: generateReceiptNo(),
    studentId: '',
    studentName: '',
    programmeId: '',
    programmeName: '',
    awardType: '',
    studyLevel: 'Year 1',
    academicYear: '2025/2026',
    semesterId: '',
    semesterName: '',
    paymentType: 'Tuition Fee',
    amountPaid: '',
    paymentMethod: 'Bank Deposit Slip',
    slipAccountNumber: '', // Bank slip account number
    slipPhotoUrl: '',      // Cloudinary image URL of the bank slip
    referenceCode: '',     // Bank teller / transaction ref
    paymentDate: new Date().toLocaleDateString('en-CA'),
    bankName: '',
    notes: '',
  };

  // --- States ---
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [paymentsList, setPaymentsList] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [programmesList, setProgrammesList] = useState([]);
  const [semestersList, setSemestersList] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [slipPreview, setSlipPreview] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterYear, setFilterYear] = useState('All');

  // ---------------------------------------------------------------------------
  // 1. LOAD REFERENCE DATA (Students, Programmes, Semesters)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') {
      setLoading(false);
      return;
    }

    const fetchReferenceData = async () => {
      try {
        const [studSnap, progSnap, semSnap] = await Promise.all([
          getDocs(query(collection(db, 'students'), where('institutionID', '==', currentInstitutionId))),
          getDocs(query(collection(db, 'programmes'), where('institutionId', '==', currentInstitutionId))),
          getDocs(query(collection(db, 'semesters'), where('institutionId', '==', currentInstitutionId))),
        ]);

        const students = studSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const progs = progSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const sems = semSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setStudentsList(students);
        setProgrammesList(progs);
        setSemestersList(sems);

        if (sems.length > 0 && !formData.semesterId) {
          const activeSem = sems.find((s) => s.status === 'Active') || sems[0];
          setFormData((prev) => ({
            ...prev,
            academicYear: activeSem.academicYear || '2025/2026',
            semesterId: activeSem.id,
            semesterName: activeSem.semesterName || activeSem.code || 'Semester',
          }));
        }
      } catch (err) {
        console.error('Error fetching reference data for payments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReferenceData();
  }, [currentInstitutionId]);

  // ---------------------------------------------------------------------------
  // 2. REAL-TIME LISTENER FOR PAYMENTS DIRECTORY
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') return;

    const paymentsRef = collection(db, 'fees_payments');
    const q = query(paymentsRef, where('institutionID', '==', currentInstitutionId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setPaymentsList(data);
      },
      (error) => {
        console.error('Error fetching fee payment records:', error);
      }
    );

    return () => unsubscribe();
  }, [currentInstitutionId]);

  // ---------------------------------------------------------------------------
  // 3. AUTO-FILL STUDENT DETAILS WHEN STUDENT ID IS SELECTED
  // ---------------------------------------------------------------------------
  const handleStudentSelect = (e) => {
    const selectedStudentId = e.target.value;
    const student = studentsList.find((s) => s.studentId === selectedStudentId);

    if (student) {
      setFormData((prev) => ({
        ...prev,
        studentId: student.studentId || '',
        studentName: student.fullName || '',
        programmeId: student.programmeId || '',
        programmeName: student.programmeName || '',
        awardType: student.awardType || '',
        studyLevel: student.studyLevel || 'Year 1',
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        studentId: selectedStudentId,
        studentName: '',
        programmeId: '',
        programmeName: '',
        awardType: '',
      }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === 'semesterId') {
      const selectedSem = semestersList.find((s) => s.id === value);
      setFormData((prev) => ({
        ...prev,
        semesterId: value,
        semesterName: selectedSem?.semesterName || selectedSem?.code || '',
        academicYear: selectedSem?.academicYear || prev.academicYear,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // ---------------------------------------------------------------------------
  // 4. CLOUDINARY BANK SLIP PHOTO UPLOAD
  // ---------------------------------------------------------------------------
  const handleSlipUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!currentInstitutionId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please log in again.' });
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setMessage({ type: 'error', text: 'Invalid file type. Please upload a JPEG, PNG, or GIF image.' });
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setMessage({ type: 'error', text: `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit.` });
      return;
    }

    if (!formData.studentId.trim()) {
      setMessage({ type: 'error', text: 'Please select a Student ID before uploading the bank slip photo.' });
      return;
    }

    setUploadingSlip(true);
    setMessage({ type: '', text: '' });

    try {
      const sanitizedInstId = currentInstitutionId.replace(/[/\\?%*:|"<>]/g, '_');
      const sanitizedStudentId = formData.studentId.trim().replace(/[/\\?%*:|"<>]/g, '_');
      const dynamicFolder = `${sanitizedInstId}/${sanitizedStudentId}/bank_slips`;

      const data = new FormData();
      data.append('file', file);
      data.append('upload_preset', UPLOAD_PRESET);
      data.append('folder', dynamicFolder);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: data,
      });

      const uploadedImage = await res.json();

      if (uploadedImage.secure_url) {
        setSlipPreview(uploadedImage.secure_url);
        setFormData((prev) => ({ ...prev, slipPhotoUrl: uploadedImage.secure_url }));
        setMessage({ type: 'success', text: 'Bank deposit slip uploaded successfully to Cloudinary!' });
      } else {
        throw new Error(uploadedImage.error?.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      setMessage({ type: 'error', text: 'Failed to upload bank slip photo. Please try again.' });
    } finally {
      setUploadingSlip(false);
    }
  };

  const resetForm = () => {
    const activeSem = semestersList.find((s) => s.status === 'Active') || semestersList[0];
    setFormData({
      ...initialFormState,
      receiptNo: generateReceiptNo(),
      academicYear: activeSem?.academicYear || '2025/2026',
      semesterId: activeSem?.id || '',
      semesterName: activeSem?.semesterName || activeSem?.code || '',
    });
    setSlipPreview(null);
    setEditingId(null);
  };

  // ---------------------------------------------------------------------------
  // 5. SUBMIT PAYMENT TRANSACTION
  // ---------------------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentInstitutionId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please log in again.' });
      return;
    }

    if (!formData.studentId || !formData.amountPaid || !formData.semesterId) {
      setMessage({ type: 'error', text: 'Please fill in Student ID, Amount Paid, and Semester.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    const payload = {
      ...formData,
      amountPaid: Number(formData.amountPaid),
      institutionID: currentInstitutionId,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        const paymentDocRef = doc(db, 'fees_payments', editingId);
        await updateDoc(paymentDocRef, payload);
        setMessage({ type: 'success', text: 'Fee payment record updated successfully!' });
      } else {
        const paymentsRef = collection(db, 'fees_payments');
        await addDoc(paymentsRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setMessage({ type: 'success', text: 'Fee payment recorded successfully!' });
      }

      resetForm();
    } catch (error) {
      console.error('Error saving fee payment:', error);
      setMessage({ type: 'error', text: 'Failed to save payment record. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Action Handlers ---
  const handleEdit = (payment) => {
    setEditingId(payment.id);
    setFormData({
      receiptNo: payment.receiptNo || generateReceiptNo(),
      studentId: payment.studentId || '',
      studentName: payment.studentName || '',
      programmeId: payment.programmeId || '',
      programmeName: payment.programmeName || '',
      awardType: payment.awardType || '',
      studyLevel: payment.studyLevel || 'Year 1',
      academicYear: payment.academicYear || '2025/2026',
      semesterId: payment.semesterId || '',
      semesterName: payment.semesterName || '',
      paymentType: payment.paymentType || 'Tuition Fee',
      amountPaid: payment.amountPaid || '',
      paymentMethod: payment.paymentMethod || 'Bank Deposit Slip',
      slipAccountNumber: payment.slipAccountNumber || '',
      slipPhotoUrl: payment.slipPhotoUrl || '',
      referenceCode: payment.referenceCode || '',
      paymentDate: payment.paymentDate || new Date().toLocaleDateString('en-CA'),
      bankName: payment.bankName || '',
      notes: payment.notes || '',
    });
    setSlipPreview(payment.slipPhotoUrl || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'fees_payments', id));
        if (editingId === id) resetForm();
      } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Failed to delete payment record.');
      }
    }
  };

  // --- Filtered Payments List ---
  const filteredPayments = paymentsList.filter((item) => {
    const matchesSearch =
      item.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.studentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.receiptNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.slipAccountNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.referenceCode?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesYear = filterYear === 'All' || item.academicYear === filterYear;

    return matchesSearch && matchesYear;
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10 font-sans">
      {/* Page Header */}
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {editingId ? 'Edit Fee Payment Record' : 'Student Fees &amp; Bank Slip Payments'}
          </h1>
          <p className="text-sm text-gray-500">
            Active Institution ID: <span className="font-mono font-semibold text-blue-600">{currentInstitutionId || 'N/A'}</span>
          </p>
        </div>
        {editingId && (
          <button
            onClick={resetForm}
            className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-3 py-1.5 rounded"
          >
            Cancel Editing
          </button>
        )}
      </div>

      {/* Alert Banner */}
      {message.text && (
        <div
          className={`p-4 rounded-md text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* FEES PAYMENT FORM */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* SECTION 1: ACADEMIC & STUDENT IDENTIFICATION */}
        <div className="bg-white p-6 border rounded-lg shadow-sm space-y-4">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
            1. Academic Term &amp; Student Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Academic Year <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="academicYear"
                required
                placeholder="2025/2026"
                value={formData.academicYear}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm font-mono font-bold text-gray-800 bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Semester / Term <span className="text-red-500">*</span>
              </label>
              <select
                name="semesterId"
                required
                value={formData.semesterId}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-white font-medium text-gray-800"
              >
                <option value="">-- Choose Semester --</option>
                {semestersList.map((sem) => (
                  <option key={sem.id} value={sem.id}>
                    {sem.semesterName || sem.code} ({sem.academicYear})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Student ID / Matric No <span className="text-red-500">*</span>
              </label>
              <select
                name="studentId"
                required
                value={formData.studentId}
                onChange={handleStudentSelect}
                className="w-full border p-2 rounded text-sm bg-white font-mono font-bold text-blue-800"
              >
                <option value="">-- Select Student ID --</option>
                {studentsList.map((st) => (
                  <option key={st.id} value={st.studentId}>
                    {st.studentId} — {st.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Student Full Name</label>
              <input
                type="text"
                name="studentName"
                required
                placeholder="Auto-filled from Student ID"
                value={formData.studentName}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-gray-50 font-semibold text-gray-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Programme / Course</label>
              <input
                type="text"
                name="programmeName"
                readOnly
                placeholder="Auto-filled programme"
                value={formData.programmeName}
                className="w-full border p-2 rounded text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Study Level</label>
              <input
                type="text"
                name="studyLevel"
                readOnly
                value={formData.studyLevel}
                className="w-full border p-2 rounded text-sm bg-gray-100 text-gray-700 font-mono cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Receipt No (Auto)</label>
              <input
                type="text"
                name="receiptNo"
                readOnly
                value={formData.receiptNo}
                className="w-full border p-2 rounded text-sm bg-gray-100 font-mono text-gray-600 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: BANK SLIP PHOTO & TRANSACTION DETAILS */}
        <div className="bg-white p-6 border rounded-lg shadow-sm space-y-6">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
            2. Bank Slip Verification &amp; Transaction Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Bank Slip Upload Column */}
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
              {slipPreview ? (
                <img
                  src={slipPreview}
                  alt="Bank Slip Preview"
                  className="w-32 h-36 object-cover rounded-md border shadow-sm mb-3"
                />
              ) : (
                <div className="w-32 h-36 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 text-xs text-center p-2 mb-3">
                  Upload Bank Deposit Slip Photo
                </div>
              )}
              <label className={`cursor-pointer text-xs font-semibold px-3 py-2 rounded border transition-colors ${
                uploadingSlip ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              }`}>
                {uploadingSlip ? 'Uploading...' : 'Upload Slip Photo'}
                <input
                  type="file"
                  accept="image/jpeg, image/png, image/gif"
                  onChange={handleSlipUpload}
                  disabled={uploadingSlip}
                  className="hidden"
                />
              </label>
              <span className="text-[10px] text-gray-400 mt-2 text-center">
                Cloudinary Storage
              </span>
            </div>

            {/* Transaction Inputs */}
            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fee Type</label>
                <select
                  name="paymentType"
                  value={formData.paymentType}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm bg-white font-medium"
                >
                  {PAYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Amount Paid <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="amountPaid"
                  required
                  min="0"
                  step="0.01"
                  placeholder="e.g., 2500.00"
                  value={formData.amountPaid}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm font-bold font-mono text-emerald-700 bg-emerald-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm bg-white font-medium"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Slip Account Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="slipAccountNumber"
                  required
                  placeholder="e.g., 003011223344"
                  value={formData.slipAccountNumber}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm font-mono font-bold text-blue-900 bg-blue-50/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  name="paymentDate"
                  required
                  value={formData.paymentDate}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name / Branch</label>
                <input
                  type="text"
                  name="bankName"
                  placeholder="e.g., Rokel Commercial Bank"
                  value={formData.bankName}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Teller / Reference No (Optional)</label>
                <input
                  type="text"
                  name="referenceCode"
                  placeholder="e.g., TXN98765432"
                  value={formData.referenceCode}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm font-mono"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Payment Remarks / Notes</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="Optional notes e.g., First installment..."
                  value={formData.notes}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="flex justify-end gap-3 border-t pt-4">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm px-6 py-3 rounded-lg transition-colors"
            >
              Cancel Edit
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || uploadingSlip}
            className={`${
              editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
            } text-white font-medium text-sm px-8 py-3 rounded-lg shadow-sm disabled:opacity-50 transition-colors`}
          >
            {submitting ? 'Processing Payment...' : editingId ? 'Update Payment Record' : 'Record & Save Payment'}
          </button>
        </div>
      </form>

      {/* PAYMENTS DIRECTORY TABLE */}
      <div className="bg-white border rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Fee Payment Transactions Directory</h2>
            <p className="text-xs text-gray-500">
              Showing recorded payments for Institution ID: <span className="font-mono font-semibold">{currentInstitutionId || 'N/A'}</span>
            </p>
          </div>

          {/* Search & Year Filter */}
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              placeholder="Search student, account no, receipt..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border p-2 rounded text-xs w-full sm:w-60 focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="border p-2 rounded text-xs bg-white w-full sm:w-auto font-mono"
            >
              <option value="All">All Academic Years</option>
              {Array.from(new Set(paymentsList.map((p) => p.academicYear))).map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-700 border-b uppercase tracking-wider">
                <th className="p-3">Receipt / Date</th>
                <th className="p-3">Student Name &amp; ID</th>
                <th className="p-3">Academic Term</th>
                <th className="p-3">Slip Account No</th>
                <th className="p-3">Amount Paid</th>
                <th className="p-3">Bank / Method</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center p-6 text-gray-500">
                    Loading payment records...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center p-6 text-gray-400">
                    No fee payment records found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      editingId === payment.id ? 'bg-amber-50/60' : ''
                    }`}
                  >
                    <td className="p-3 font-mono">
                      <div className="font-bold text-gray-900">{payment.receiptNo}</div>
                      <div className="text-[10px] text-gray-500">{payment.paymentDate}</div>
                    </td>

                    <td className="p-3 flex items-center gap-2.5">
                      {payment.slipPhotoUrl ? (
                        <a href={payment.slipPhotoUrl} target="_blank" rel="noopener noreferrer" title="View Slip">
                          <img src={payment.slipPhotoUrl} alt="Slip" className="w-8 h-8 rounded object-cover border shadow-xs" />
                        </a>
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 text-gray-400 flex items-center justify-center text-[10px]">
                          Slip
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-gray-900">{payment.studentName}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{payment.studentId}</div>
                      </div>
                    </td>

                    <td className="p-3 font-medium">
                      <div className="text-gray-800">{payment.academicYear}</div>
                      <div className="text-[10px] text-blue-600 font-semibold">{payment.semesterName}</div>
                    </td>

                    <td className="p-3 font-mono font-bold text-blue-900">
                      {payment.slipAccountNumber || '—'}
                    </td>

                    <td className="p-3 font-mono font-bold text-emerald-700 text-sm">
                      Le {Number(payment.amountPaid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td className="p-3">
                      <div className="text-gray-800">{payment.paymentMethod}</div>
                      <div className="text-[10px] text-gray-400">{payment.bankName || 'General'}</div>
                    </td>

                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleEdit(payment)}
                        className="bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold px-2.5 py-1 rounded border border-amber-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(payment.id)}
                        className="bg-red-50 text-red-600 hover:bg-red-100 font-semibold px-2.5 py-1 rounded border border-red-200 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}