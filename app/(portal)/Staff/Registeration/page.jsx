'use client';
//app/(portal)/Staff/Registeration/page.jsx
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
  serverTimestamp,
} from 'firebase/firestore';

// --- Cloudinary Configuration Constants ---
const CLOUD_NAME = "us1rsa1j";
const UPLOAD_PRESET = "LeotechProject2";
const MAX_FILE_SIZE_MB = 2;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"];

// --- Helper: Generate 6-Character Alphanumeric ID ---
const generateStaffId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function StaffRegistrationPage() {
  const { user } = useAuth();

  // ✅ Retrieve institutionID from Auth Context session
  const currentInstitutionId = user?.institutionID || user?.schoolId || user?.data?.institutionID || user?.data?.schoolId || '';

  // --- Initial Form State Helper ---
  const initialFormState = {
    staffId: generateStaffId(), // Auto-generate on start
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
    staffType: 'Academic Staff',
    designation: 'Lecturer',
    employmentDate: '',
    qualification: "Bachelor's Degree",
    status: 'Active',
  };

  // --- States ---
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');

  // --- Options lists ---
  const ACADEMIC_DESIGNATIONS = [
    'Lecturer',
    'Senior Lecturer',
    'Professor',
    'Dean',
    'HOD',
    'Assistant Lecturer',
    'Adjunct Lecturer',
  ];

  const ADMIN_DESIGNATIONS = [
    'Registrar',
    'Finance Officer',
    'Secretary',
    'Admission Officer',
    'Exam Officer',
    'ICT Officer',
  ];

  const SUPPORT_DESIGNATIONS = [
    'Office Assistant',
    'Driver',
    'Security Officer',
    'Maintenance Staff',
    'Janitor',
  ];

  // --- Real-time Firestore Fetch strictly filtered where institutionID == currentInstitutionId ---
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') {
      setLoadingList(false);
      return;
    }

    const staffRef = collection(db, 'staff');
    const q = query(
      staffRef,
      where('institutionID', '==', currentInstitutionId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const staffData = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setStaffList(staffData);
        setLoadingList(false);
      },
      (error) => {
        console.error('Error fetching staff records for institution:', error);
        setLoadingList(false);
      }
    );

    return () => unsubscribe();
  }, [currentInstitutionId]);

  // --- Form Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === 'staffType') {
      let defaultDesignation = 'Lecturer';
      if (value === 'Administrative Staff') defaultDesignation = 'Registrar';
      if (value === 'Support Staff') defaultDesignation = 'Office Assistant';

      setFormData((prev) => ({
        ...prev,
        staffType: value,
        designation: defaultDesignation,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // --- Cloudinary Upload Handler (institutionID/staffId/photo) ---
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

    if (!formData.staffId.trim()) {
      setMessage({ type: 'error', text: 'Staff ID is required before uploading a photo.' });
      return;
    }

    setUploadingPhoto(true);
    setMessage({ type: '', text: '' });

    try {
      const sanitizedInstId = currentInstitutionId.replace(/[/\\?%*:|"<>]/g, '_');
      const sanitizedStaffId = formData.staffId.trim().replace(/[/\\?%*:|"<>]/g, '_');
      const dynamicFolder = `${sanitizedInstId}/${sanitizedStaffId}/photo`;

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
        setMessage({ type: 'success', text: 'Photo uploaded successfully to Cloudinary!' });
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
    setFormData({
      ...initialFormState,
      staffId: generateStaffId(),
    });
    setPhotoPreview(null);
    setEditingId(null);
  };

  // Submit Handler with Strict Institution ID Protection
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentInstitutionId) {
      setMessage({
        type: 'error',
        text: 'Institution ID is missing. Please log in again.',
      });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    const payload = {
      ...formData,
      institutionID: currentInstitutionId,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        const staffMember = staffList.find((staff) => staff.id === editingId);
        if (!staffMember || staffMember.institutionID !== currentInstitutionId) {
          setMessage({
            type: 'error',
            text: 'You cannot update a record belonging to another institution.',
          });
          setSubmitting(false);
          return;
        }

        const staffDocRef = doc(db, 'staff', editingId);
        await updateDoc(staffDocRef, payload);
        setMessage({ type: 'success', text: 'Staff record updated successfully!' });
      } else {
        const staffRef = collection(db, 'staff');
        await addDoc(staffRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setMessage({ type: 'success', text: 'Staff record registered successfully!' });
      }

      resetForm();
    } catch (error) {
      console.error('Error saving staff member:', error);
      setMessage({ type: 'error', text: 'Failed to save staff record. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Action Handlers ---
  const handleEdit = (staffMember) => {
    if (staffMember.institutionID !== currentInstitutionId) {
      alert('You cannot edit a record belonging to another institution.');
      return;
    }

    setEditingId(staffMember.id);
    setFormData({
      staffId: staffMember.staffId || generateStaffId(),
      passportPhotoUrl: staffMember.passportPhotoUrl || '',
      title: staffMember.title || 'Mr.',
      fullName: staffMember.fullName || '',
      gender: staffMember.gender || 'Male',
      dateOfBirth: staffMember.dateOfBirth || '',
      nationality: staffMember.nationality || 'Sierra Leonean',
      nationalId: staffMember.nationalId || '',
      phone: staffMember.phone || '',
      altPhone: staffMember.altPhone || '',
      email: staffMember.email || '',
      address: staffMember.address || '',
      city: staffMember.city || '',
      district: staffMember.district || '',
      staffType: staffMember.staffType || 'Academic Staff',
      designation: staffMember.designation || 'Lecturer',
      employmentDate: staffMember.employmentDate || '',
      qualification: staffMember.qualification || "Bachelor's Degree",
      status: staffMember.status || 'Active',
    });
    setPhotoPreview(staffMember.passportPhotoUrl || null);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleStatus = async (staffMember) => {
    if (staffMember.institutionID !== currentInstitutionId) {
      alert('You cannot modify a record belonging to another institution.');
      return;
    }

    const newStatus = staffMember.status === 'Active' ? 'On Leave' : 'Active';
    try {
      const staffDocRef = doc(db, 'staff', staffMember.id);
      await updateDoc(staffDocRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status.');
    }
  };

  const handleDelete = async (id, name) => {
    const staffMember = staffList.find((staff) => staff.id === id);

    if (!staffMember || staffMember.institutionID !== currentInstitutionId) {
      setMessage({
        type: 'error',
        text: 'You cannot delete a record belonging to another institution.',
      });
      return;
    }

    if (confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, 'staff', id));
        if (editingId === id) resetForm();
      } catch (error) {
        console.error('Error deleting record:', error);
        alert('Failed to delete staff member.');
      }
    }
  };

  // --- Filtered List for Table ---
  const filteredStaff = staffList.filter((item) => {
    const matchesSearch =
      item.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.staffId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'All' || item.staffType === filterType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10">
      {/* Page Header */}
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {editingId ? 'Edit Staff Record' : 'Staff Registration & Directory'}
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
        {/* SECTION 1: PERSONAL INFORMATION */}
        <div className="bg-white p-6 border rounded-lg shadow-sm space-y-6">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
            1. Personal Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Photo Upload Column */}
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Passport Preview"
                  className="w-32 h-32 object-cover rounded-md border shadow-sm mb-3"
                />
              ) : (
                <div className="w-32 h-32 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 text-xs text-center mb-3">
                  Passport Photo
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
                Cloudinary Folder: {currentInstitutionId || 'N/A'} / {formData.staffId}
              </span>
            </div>

            {/* Personal Details Inputs */}
            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center justify-between">
                  <span>Staff ID (Auto) <span className="text-red-500">*</span></span>
                  {!editingId && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, staffId: generateStaffId() }))}
                      className="text-[10px] text-blue-600 hover:underline font-mono"
                    >
                      Regenerate
                    </button>
                  )}
                </label>
                <input
                  type="text"
                  name="staffId"
                  required
                  readOnly
                  value={formData.staffId}
                  className="w-full border p-2 rounded text-sm bg-gray-100 font-mono text-gray-700 cursor-not-allowed"
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
                  <option value="Mrs.">Mrs.</option>
                  <option value="Ms.">Ms.</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Prof.">Prof.</option>
                  <option value="Rev.">Rev.</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  required
                  placeholder="e.g., John Doe"
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
                required
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
                required
                placeholder="staff@institution.edu"
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

        {/* SECTION 3: EMPLOYMENT & STATUS */}
        <div className="bg-white p-6 border rounded-lg shadow-sm space-y-4">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
            3. Employment & Status
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Staff Type <span className="text-red-500">*</span>
              </label>
              <select
                name="staffType"
                value={formData.staffType}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-white font-medium text-gray-800"
              >
                <option value="Academic Staff">Academic Staff</option>
                <option value="Administrative Staff">Administrative Staff</option>
                <option value="Support Staff">Support Staff</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Designation / Position <span className="text-red-500">*</span>
              </label>
              <select
                name="designation"
                value={formData.designation}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-white font-medium text-blue-900"
              >
                {formData.staffType === 'Academic Staff' &&
                  ACADEMIC_DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                {formData.staffType === 'Administrative Staff' &&
                  ADMIN_DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                {formData.staffType === 'Support Staff' &&
                  SUPPORT_DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Employment Date</label>
              <input
                type="date"
                name="employmentDate"
                value={formData.employmentDate}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Highest Qualification</label>
              <select
                name="qualification"
                value={formData.qualification}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-white"
              >
                <option value="High School Certificate">High School Certificate</option>
                <option value="Diploma">Diploma</option>
                <option value="Higher National Diploma">Higher National Diploma</option>
                <option value="Bachelor's Degree">Bachelor's Degree</option>
                <option value="Master's Degree">Master's Degree</option>
                <option value="Doctorate / PhD">Doctorate / PhD</option>
                <option value="Professional Certification">Professional Certification</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Employment Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full border p-2 rounded text-sm bg-white font-semibold"
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Suspended">Suspended</option>
                <option value="Retired">Retired</option>
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
                ? 'Updating Staff...'
                : 'Registering Staff...'
              : editingId
              ? 'Update Staff Record'
              : 'Save & Register Staff Member'}
          </button>
        </div>
      </form>

      {/* DIRECTORY & FETCH TABLE SECTION */}
      <div className="bg-white border rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Staff Records Directory</h2>
            <p className="text-xs text-gray-500">Filtered for Institution ID: <span className="font-mono font-semibold">{currentInstitutionId || 'N/A'}</span></p>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              placeholder="Search by name, ID, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border p-2 rounded text-xs w-full sm:w-60 focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border p-2 rounded text-xs bg-white w-full sm:w-auto"
            >
              <option value="All">All Categories</option>
              <option value="Academic Staff">Academic Staff</option>
              <option value="Administrative Staff">Administrative Staff</option>
              <option value="Support Staff">Support Staff</option>
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-700 border-b uppercase tracking-wider">
                <th className="p-3">Staff Member</th>
                <th className="p-3">Staff ID</th>
                <th className="p-3">Category</th>
                <th className="p-3">Designation</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingList ? (
                <tr>
                  <td colSpan="7" className="text-center p-6 text-gray-500">
                    Loading staff records for institution...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center p-6 text-gray-500">
                    No staff records found for this institution.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => (
                  <tr
                    key={staff.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      editingId === staff.id ? 'bg-amber-50/60' : ''
                    }`}
                  >
                    {/* Staff Member (Photo + Name) */}
                    <td className="p-3 flex items-center gap-3">
                      {staff.passportPhotoUrl ? (
                        <img
                          src={staff.passportPhotoUrl}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover border"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-xs">
                          {staff.fullName ? staff.fullName.charAt(0) : 'S'}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-gray-900">
                          {staff.title} {staff.fullName}
                        </div>
                        <div className="text-[10px] text-gray-500">{staff.qualification}</div>
                      </div>
                    </td>

                    <td className="p-3 font-mono font-medium text-gray-700">{staff.staffId}</td>
                    <td className="p-3 text-gray-600">{staff.staffType}</td>
                    <td className="p-3 font-medium text-blue-900">{staff.designation}</td>
                    <td className="p-3">
                      <div>{staff.phone}</div>
                      <div className="text-[10px] text-gray-500">{staff.email}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          staff.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : staff.status === 'On Leave'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {staff.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(staff)}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(staff)}
                        className="text-gray-600 hover:underline font-medium"
                      >
                        {staff.status === 'Active' ? 'Set Leave' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(staff.id, staff.fullName)}
                        className="text-red-600 hover:underline font-medium"
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