'use client';
// app/(portal)/Staff/GradingScale/page.jsx
import React, { useState, useEffect } from 'react';
import { GradeAndAttendance } from "@/app/lib/gradeAttendanceFirebase";
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

export default function GradingScaleConfigPage() {
  const { user } = useAuth();

  // ✅ Retrieve institutionID from Auth Context session
  const currentInstitutionId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    '';

  // --- Initial Form State ---
  const initialScaleState = {
    grade: 'A',
    minScore: '',
    maxScore: '',
    gradePoint: '5.00',
    description: 'Excellent',
  };

  // --- States ---
  const [formData, setFormData] = useState(initialScaleState);
  const [editingId, setEditingId] = useState(null);
  const [scalesList, setScalesList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const GRADE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  // --- Real-time Firestore Fetch strictly filtered by institutionID ---
  useEffect(() => {
    if (!currentInstitutionId || currentInstitutionId === 'N/A') {
      setLoadingList(false);
      return;
    }

    const gradingRef = collection(GradeAndAttendance, 'grading_scales');
    const q = query(
      gradingRef,
      where('institutionID', '==', currentInstitutionId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const scalesData = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        // Sort descending by minScore
        scalesData.sort((a, b) => b.minScore - a.minScore);
        setScalesList(scalesData);
        setLoadingList(false);
      },
      (error) => {
        console.error('Error fetching grading scales:', error);
        setLoadingList(false);
      }
    );

    return () => unsubscribe();
  }, [currentInstitutionId]);

  // --- Form Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData(initialScaleState);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentInstitutionId) {
      setMessage({
        type: 'error',
        text: 'Institution ID is missing. Please log in again.',
      });
      return;
    }

    const min = Number(formData.minScore);
    const max = Number(formData.maxScore);

    if (min >= max) {
      setMessage({
        type: 'error',
        text: 'Minimum score must be less than Maximum score.',
      });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    // ✅ Format gradePoint with two decimal places (e.g., "5.00", "4.00")
    const formattedGradePoint =
      formData.gradePoint !== '' && !isNaN(formData.gradePoint)
        ? Number(formData.gradePoint).toFixed(2)
        : '0.00';

    const payload = {
      grade: formData.grade,
      minScore: min,
      maxScore: max,
      gradePoint: formattedGradePoint,
      description: formData.description,
      institutionID: currentInstitutionId,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        const record = scalesList.find((item) => item.id === editingId);
        if (!record || record.institutionID !== currentInstitutionId) {
          setMessage({
            type: 'error',
            text: 'You cannot update a grading scale belonging to another institution.',
          });
          setSubmitting(false);
          return;
        }

        await updateDoc(doc(GradeAndAttendance, 'grading_scales', editingId), payload);
        setMessage({ type: 'success', text: 'Grading scale updated successfully!' });
      } else {
        await addDoc(collection(GradeAndAttendance, 'grading_scales'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setMessage({ type: 'success', text: 'Grading scale range added successfully!' });
      }

      resetForm();
    } catch (error) {
      console.error('Error saving grading scale:', error);
      setMessage({ type: 'error', text: 'Failed to save grading scale.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (scale) => {
    if (scale.institutionID !== currentInstitutionId) {
      alert('You cannot edit a scale belonging to another institution.');
      return;
    }

    setEditingId(scale.id);
    setFormData({
      grade: scale.grade || 'A',
      minScore: scale.minScore !== undefined ? scale.minScore : '',
      maxScore: scale.maxScore !== undefined ? scale.maxScore : '',
      gradePoint:
        scale.gradePoint !== undefined && scale.gradePoint !== null
          ? Number(scale.gradePoint).toFixed(2)
          : '4.00',
      description: scale.description || '',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    const scale = scalesList.find((item) => item.id === id);
    if (!scale || scale.institutionID !== currentInstitutionId) return;

    if (confirm('Are you sure you want to delete this grading rule?')) {
      try {
        await deleteDoc(doc(GradeAndAttendance, 'grading_scales', id));
        if (editingId === id) resetForm();
        setMessage({ type: 'success', text: 'Grading scale deleted successfully.' });
      } catch (error) {
        console.error('Error deleting scale:', error);
        alert('Failed to delete grade rule.');
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Page Header */}
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {editingId ? 'Edit Grading Scale Rule' : 'Institution Grading Policy Configuration'}
          </h1>
          <p className="text-sm text-gray-500">
            Define custom score intervals (e.g., 70-100 = A vs 80-100 = A) for Institution ID:{' '}
            <span className="font-mono font-semibold text-blue-600">
              {currentInstitutionId || 'N/A'}
            </span>
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

      {/* FORM CONFIGURATION */}
      <form onSubmit={handleSubmit} className="bg-white p-6 border rounded-lg shadow-sm space-y-6">
        <h2 className="text-md font-bold text-blue-900 uppercase tracking-wide border-b pb-2">
          Configure Grade Score Range
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Letter Grade <span className="text-red-500">*</span>
            </label>
            <select
              name="grade"
              value={formData.grade}
              onChange={handleInputChange}
              className="w-full border p-2 rounded text-sm bg-white font-bold text-indigo-700"
            >
              {GRADE_LETTERS.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Min Score (%) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="minScore"
              min="0"
              max="100"
              required
              placeholder="e.g., 70 or 80"
              value={formData.minScore}
              onChange={handleInputChange}
              className="w-full border p-2 rounded text-sm font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Max Score (%) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="maxScore"
              min="0"
              max="100"
              required
              placeholder="e.g., 100"
              value={formData.maxScore}
              onChange={handleInputChange}
              className="w-full border p-2 rounded text-sm font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Grade Point (GPA)</label>
            <input
              type="number"
              step="0.01"
              name="gradePoint"
              placeholder="e.g., 5.00"
              value={formData.gradePoint}
              onChange={handleInputChange}
              className="w-full border p-2 rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              name="description"
              placeholder="e.g., Excellent / Distinction"
              value={formData.description}
              onChange={handleInputChange}
              className="w-full border p-2 rounded text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm px-6 py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={`${
              editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
            } text-white font-medium text-sm px-8 py-2.5 rounded-lg shadow-sm disabled:opacity-50 transition-colors`}
          >
            {submitting ? 'Saving Rule...' : editingId ? 'Update Grade Rule' : 'Save Grade Rule'}
          </button>
        </div>
      </form>

      {/* DEFINED GRADING SCALE DIRECTORY */}
      <div className="bg-white border rounded-lg shadow-sm p-6 space-y-4">
        <div className="border-b pb-3">
          <h2 className="text-lg font-bold text-gray-800">Current Institution Grading Policy</h2>
          <p className="text-xs text-gray-500">
            Exam grade inputs will automatically map scores to these rules.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-700 border-b uppercase tracking-wider">
                <th className="p-3">Letter Grade</th>
                <th className="p-3">Score Range</th>
                <th className="p-3">Grade Point</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingList ? (
                <tr>
                  <td colSpan="5" className="text-center p-6 text-gray-500">
                    Loading grading scales...
                  </td>
                </tr>
              ) : scalesList.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center p-6 text-gray-500">
                    No grading policies configured yet. Add your institution's range above.
                  </td>
                </tr>
              ) : (
                scalesList.map((scale) => (
                  <tr
                    key={scale.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      editingId === scale.id ? 'bg-amber-50/60' : ''
                    }`}
                  >
                    <td className="p-3">
                      <span className="px-3 py-1 rounded bg-indigo-100 text-indigo-900 font-bold text-sm">
                        {scale.grade}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-gray-800">
                      {scale.minScore}% — {scale.maxScore}%
                    </td>
                    <td className="p-3 font-mono font-medium text-blue-800">
                      {scale.gradePoint !== undefined && scale.gradePoint !== null && !isNaN(scale.gradePoint)
                        ? Number(scale.gradePoint).toFixed(2)
                        : scale.gradePoint}{' '}
                      GPA
                    </td>
                    <td className="p-3 text-gray-600">{scale.description || '—'}</td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(scale)}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(scale.id)}
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