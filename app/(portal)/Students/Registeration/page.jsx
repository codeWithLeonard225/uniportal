'use client';
// app/(portal)/Institution/StudentRegistration/page.jsx
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

const STUDY_LEVELS = [
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'Postgraduate / Masters',
];

// --- Helper: Generate Auto Portal ID ---
const generatePortalId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "PRT";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// --- Helper: Resolve Display ID (manual studentId if available, else portalId) ---
const getDisplayStudentId = (student) => {
  const manualId = student?.studentId?.trim();
  if (manualId) return manualId;
  return student?.portalId || student?.legacyStudentId || '';
};

export default function StudentRegistrationPage() {
  const { user } = useAuth();

  // ✅ Retrieve institutionID from Auth Context session
  const currentInstitutionId = user?.institutionID || user?.schoolId || user?.data?.institutionID || user?.data?.schoolId || '';

  // --- Initial Form State ---
  const initialFormState = {
    portalId: generatePortalId(),
    studentId: '', // Optional manual Student ID
    passportPhotoUrl: '',
    title: 'Mr.',
    fullName: '',
    gender: 'Male',
    dateOfBirth: '',
    nationality: 'Sierra Leonean',
    nationalId: '',
    phone: '',
    altPhone: '',
    email: '',
    address: '',
    city: '',
    district: '',
    programmeId: '',
    programmeName: '',
    awardType: '',
    studyLevel: STUDY_LEVELS[0],
    academicYear: '2025/2026',
    enrollmentDate: '',
    status: 'Active', // Active | Suspended | Graduated | Withdrawn | On Leave
  };

  // --- States ---
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [studentList, setStudentList] = useState([]);
  const [programmesList, setProgrammesList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState('All');
  const [filterProgramme, setFilterProgramme] = useState('All');

  // --- Load Academic Programmes for Dropdown ---
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') return;

    const fetchProgrammes = async () => {
      try {
        const qProgs = query(
          collection(db, 'programmes'),
          where('institutionId', '==', currentInstitutionId)
        );
        const pSnap = await getDocs(qProgs);
        const progs = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setProgrammesList(progs);

        if (progs.length > 0 && !formData.programmeId) {
          setFormData((prev) => ({
            ...prev,
            programmeId: progs[0].id,
            programmeName: progs[0].programmeName,
            awardType: progs[0].awardType || 'General',
          }));
        }
      } catch (err) {
        console.error('Error fetching programmes:', err);
      }
    };

    fetchProgrammes();
  }, [currentInstitutionId]);

  // --- Real-Time Listener strictly filtered by institutionID ---
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') {
      setLoadingList(false);
      return;
    }

    const studentsRef = collection(db, 'students');
    const q = query(
      studentsRef,
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
        setLoadingList(false);
      },
      (error) => {
        console.error('Error fetching student records:', error);
        setLoadingList(false);
      }
    );

    return () => unsubscribe();
  }, [currentInstitutionId]);

  // --- Form Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === 'programmeId') {
      const selectedProg = programmesList.find(
        (p) => p.id === value
      );

      setFormData((prev) => ({
        ...prev,
        programmeId: value,
        programmeName: selectedProg?.programmeName || '',
        awardType: selectedProg?.awardType || 'General',
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // --- Cloudinary Upload Handler (institutionID/portalId/photo) ---
  const handlePhotoUpload = async (e) => {
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

    const folderKey = (formData.portalId || formData.studentId || '').trim();
    if (!folderKey) {
      setMessage({ type: 'error', text: 'Portal ID is required before uploading a photo.' });
      return;
    }

    setUploadingPhoto(true);
    setMessage({ type: '', text: '' });

    try {
      const sanitizedInstId = currentInstitutionId.replace(/[/\\?%*:|"<>]/g, '_');
      const sanitizedFolderKey = folderKey.replace(/[/\\?%*:|"<>]/g, '_');
      const dynamicFolder = `${sanitizedInstId}/${sanitizedFolderKey}/photo`;

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
        setPhotoPreview(uploadedImage.secure_url);
        setFormData((prev) => ({ ...prev, passportPhotoUrl: uploadedImage.secure_url }));
        setMessage({ type: 'success', text: 'Student photo uploaded successfully to Cloudinary!' });
      } else {
        throw new Error(uploadedImage.error?.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      setMessage({ type: 'error', text: 'Failed to upload photo to Cloudinary. Please try again.' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const resetForm = () => {
    const firstProg = programmesList[0];

    setFormData({
      ...initialFormState,
      portalId: generatePortalId(),
      studentId: '',
      programmeId: firstProg?.id || '',
      programmeName: firstProg?.programmeName || '',
      awardType: firstProg?.awardType || 'General',
    });

    setPhotoPreview(null);
    setEditingId(null);
  };

  // --- Submit Handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentInstitutionId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please log in again.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    const trimmedPortalId = (formData.portalId || generatePortalId()).trim();
    const trimmedStudentId = (formData.studentId || '').trim();

    const payload = {
      ...formData,
      portalId: trimmedPortalId,
      studentId: trimmedStudentId,
      institutionID: currentInstitutionId,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        const studentMember = studentList.find((s) => s.id === editingId);
        if (!studentMember || studentMember.institutionID !== currentInstitutionId) {
          setMessage({
            type: 'error',
            text: 'You cannot update a record belonging to another institution.',
          });
          setSubmitting(false);
          return;
        }

        const studentDocRef = doc(db, 'students', editingId);
        await updateDoc(studentDocRef, payload);
        setMessage({ type: 'success', text: 'Student record updated successfully!' });
      } else {
        const studentsRef = collection(db, 'students');
        await addDoc(studentsRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setMessage({ type: 'success', text: 'Student registered successfully!' });
      }

      resetForm();
    } catch (error) {
      console.error('Error saving student:', error);
      setMessage({ type: 'error', text: 'Failed to save student record. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Action Handlers ---
  const handleEdit = (student) => {
    if (student.institutionID !== currentInstitutionId) {
      alert('You cannot edit a record belonging to another institution.');
      return;
    }

    // Backward-compatibility: if an old doc only had studentId and no portalId, preserve it cleanly
    const resolvedPortalId = student.portalId || student.studentId || generatePortalId();
    const resolvedManualStudentId = student.portalId ? (student.studentId || '') : '';

    setEditingId(student.id);
    setFormData({
      portalId: resolvedPortalId,
      studentId: resolvedManualStudentId,
      passportPhotoUrl: student.passportPhotoUrl || '',
      title: student.title || 'Mr.',
      fullName: student.fullName || '',
      gender: student.gender || 'Male',
      dateOfBirth: student.dateOfBirth || '',
      nationality: student.nationality || 'Sierra Leonean',
      nationalId: student.nationalId || '',
      phone: student.phone || '',
      altPhone: student.altPhone || '',
      email: student.email || '',
      address: student.address || '',
      city: student.city || '',
      district: student.district || '',
      programmeId: student.programmeId || '',
      programmeName: student.programmeName || '',
      awardType: student.awardType || 'General',
      studyLevel: student.studyLevel || STUDY_LEVELS[0],
      academicYear: student.academicYear || '2025/2026',
      enrollmentDate: student.enrollmentDate || '',
      status: student.status || 'Active',
    });
    setPhotoPreview(student.passportPhotoUrl || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleStatus = async (student) => {
    if (student.institutionID !== currentInstitutionId) {
      alert('You cannot modify a record belonging to another institution.');
      return;
    }

    const newStatus = student.status === 'Active' ? 'Suspended' : 'Active';
    try {
      const studentDocRef = doc(db, 'students', student.id);
      await updateDoc(studentDocRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status.');
    }
  };

  const handleDelete = async (id, name) => {
    const student = studentList.find((s) => s.id === id);

    if (!student || student.institutionID !== currentInstitutionId) {
      setMessage({
        type: 'error',
        text: 'You cannot delete a record belonging to another institution.',
      });
      return;
    }

    if (confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, 'students', id));
        if (editingId === id) resetForm();
      } catch (error) {
        console.error('Error deleting record:', error);
        alert('Failed to delete student.');
      }
    }
  };

  // --- Filtered List for Table ---
  const filteredStudents = studentList.filter((item) => {
    const displayId = getDisplayStudentId(item);
    const matchesSearch =
      item.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.portalId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.studentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      displayId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesLevel = filterLevel === 'All' || item.studyLevel === filterLevel;
    const matchesProgramme = filterProgramme === 'All' || item.programmeId === filterProgramme;

    return matchesSearch && matchesLevel && matchesProgramme;
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10 font-sans">
      {/* Page Header */}
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {editingId ? 'Edit Student Record' : 'Student Registration & Directory'}
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

      {/* FORM SECTION */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* SECTION 1: PERSONAL INFORMATION & PHOTO */}
        <div className="bg-white p-6 border rounded-lg shadow-sm space-y-6">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
            1. Personal Information & Photo
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Photo Upload Column */}
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Student Passport Preview"
                  className="w-32 h-32 object-cover rounded-md border shadow-sm mb-3"
                />
              ) : (
                <div className="w-32 h-32 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 text-xs text-center mb-3">
                  Student Passport
                </div>
              )}
              <label className={`cursor-pointer text-xs font-semibold px-3 py-2 rounded border transition-colors ${
                uploadingPhoto ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              }`}>
                {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                <input
                  type="file"
                  accept="image/jpeg, image/png, image/gif"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>
              <span className="text-[10px] text-gray-400 mt-2 text-center">
                Cloudinary: {currentInstitutionId || 'N/A'} / {formData.portalId}
              </span>
            </div>

            {/* Personal Details Inputs */}
            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Auto-Generated Portal ID */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center justify-between">
                  <span>Portal ID (Auto) <span className="text-red-500">*</span></span>
                  {!editingId && (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, portalId: generatePortalId() }))}
                      className="text-[10px] text-blue-600 hover:underline font-mono"
                    >
                      Regenerate
                    </button>
                  )}
                </label>
                <input
                  type="text"
                  name="portalId"
                  required
                  readOnly
                  value={formData.portalId}
                  className="w-full border p-2 rounded text-sm bg-gray-100 font-mono text-gray-700 cursor-not-allowed"
                />
              </div>

              {/* Manual Optional Student ID */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Student ID <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="studentId"
                  placeholder="Enter Student ID"
                  value={formData.studentId}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                <select
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm bg-white"
                >
                  <option value="Mr.">Mr.</option>
                  <option value="Ms.">Ms.</option>
                  <option value="Mrs.">Mrs.</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  required
                  placeholder="e.g., Jane Doe"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm bg-white"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date of Birth</label>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nationality</label>
                <input
                  type="text"
                  name="nationality"
                  value={formData.nationality}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">National ID / Passport</label>
                <input
                  type="text"
                  name="nationalId"
                  value={formData.nationalId}
                  onChange={handleInputChange}
                  className="w-full border p-2 rounded text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: CONTACT INFORMATION */}
        <div className="bg-white p-6 border rounded-lg shadow-sm space-y-4">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
            2. Contact Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                placeholder="+232..."
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Alternative Phone</label>
              <input
                type="tel"
                name="altPhone"
                value={formData.altPhone}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                placeholder="student@institution.edu"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Residential Address</label>
              <input
                type="text"
                name="address"
                placeholder="Street address..."
                value={formData.address}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">City / Town</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">District / Region</label>
              <input
                type="text"
                name="district"
                value={formData.district}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: ACADEMIC ENROLLMENT & STATUS */}
        <div className="bg-white p-6 border rounded-lg shadow-sm space-y-4">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
            3. Academic Enrollment & Status
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Programme / Course <span className="text-red-500">*</span>
              </label>
              <select
                name="programmeId"
                required
                value={formData.programmeId}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-white font-medium text-gray-800"
              >
                <option value="">-- Choose Programme --</option>
                {programmesList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.programmeName} ({p.awardType || 'General'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Study Level</label>
              <select
                name="studyLevel"
                value={formData.studyLevel}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-white font-medium text-blue-900"
              >
                {STUDY_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Academic Year</label>
              <input
                type="text"
                name="academicYear"
                required
                placeholder="2025/2026"
                value={formData.academicYear}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Enrollment Date</label>
              <input
                type="date"
                name="enrollmentDate"
                value={formData.enrollmentDate}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Student Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-white font-semibold"
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Graduated">Graduated</option>
                <option value="Withdrawn">Withdrawn</option>
                <option value="On Leave">On Leave</option>
              </select>
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
            disabled={submitting || uploadingPhoto}
            className={`${
              editingId
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white font-medium text-sm px-8 py-3 rounded-lg shadow-sm disabled:opacity-50 transition-colors`}
          >
            {submitting
              ? editingId
                ? 'Updating Student...'
                : 'Registering Student...'
              : editingId
              ? 'Update Student Record'
              : 'Save & Register Student'}
          </button>
        </div>
      </form>

      {/* DIRECTORY & FETCH TABLE SECTION */}
      <div className="bg-white border rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Student Directory</h2>
            <p className="text-xs text-gray-500">
              Filtered for Institution ID: <span className="font-mono font-semibold">{currentInstitutionId || 'N/A'}</span>
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              placeholder="Search by name, ID, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border p-2 rounded text-xs w-full sm:w-56 focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={filterProgramme}
              onChange={(e) => setFilterProgramme(e.target.value)}
              className="border p-2 rounded text-xs bg-white w-full sm:w-auto"
            >
              <option value="All">All Programmes</option>
              {programmesList.map((p) => (
                <option key={p.id} value={p.id}>{p.programmeName}</option>
              ))}
            </select>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="border p-2 rounded text-xs bg-white w-full sm:w-auto"
            >
              <option value="All">All Levels</option>
              {STUDY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-700 border-b uppercase tracking-wider">
                <th className="p-3">Student</th>
                <th className="p-3">Student ID</th>
                <th className="p-3">Programme</th>
                <th className="p-3">Level</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingList ? (
                <tr>
                  <td colSpan="7" className="text-center p-6 text-gray-500">
                    Loading student records for institution...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center p-6 text-gray-400">
                    No student records found for this institution.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const displayId = getDisplayStudentId(student);

                  return (
                    <tr
                      key={student.id}
                      className={`hover:bg-gray-50 transition-colors ${
                        editingId === student.id ? 'bg-amber-50/60' : ''
                      }`}
                    >
                      <td className="p-3 flex items-center gap-3">
                        {student.passportPhotoUrl ? (
                          <img
                            src={student.passportPhotoUrl}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-xs">
                            {student.fullName ? student.fullName.charAt(0) : 'S'}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-gray-900">
                            {student.title} {student.fullName}
                          </div>
                          <div className="text-[10px] text-gray-500">{student.gender}</div>
                        </div>
                      </td>

                      <td className="p-3 font-mono font-medium text-gray-700">
                        {displayId}
                      </td>

                      <td className="p-3">
                        <div className="font-medium text-gray-800">
                          {student.programmeName || 'General'}
                        </div>
                        <div className="text-[10px] text-emerald-600 font-semibold">
                          {student.awardType || 'General'}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono text-[10px]">
                          {student.studyLevel}
                        </span>
                      </td>

                      <td className="p-3">
                        <div>{student.phone}</div>
                        <div className="text-[10px] text-gray-500">{student.email}</div>
                      </td>

                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(student)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            student.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {student.status || 'Active'}
                        </button>
                      </td>

                      <td className="p-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleEdit(student)}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(student.id, student.fullName)}
                          className="text-red-600 hover:underline font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}