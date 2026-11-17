'use client';
//app/(portal)/Institution/AcademicStructure/page.jsx
import React, { useState, useEffect } from 'react';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

export default function AcademicStructurePage() {
  const { user } = useAuth();

  // ✅ Retrieve institutionID from Auth Context session (matching StaffRegistrationPage)
  const institutionId = user?.institutionID || user?.schoolId || user?.data?.institutionID || user?.data?.schoolId || '';

  const [activeTab, setActiveTab] = useState('faculties');

  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programmes, setProgrammes] = useState([]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // --- Modals State ---
  const [selectedFacultyForDean, setSelectedFacultyForDean] = useState(null);
  const [newDeanName, setNewDeanName] = useState('');

  const [itemToDelete, setItemToDelete] = useState(null); 
  const [itemToEdit, setItemToEdit] = useState(null); 

  // --- Forms State ---
  const [facultyForm, setFacultyForm] = useState({
    facultyName: '',
    code: '',
    currentDean: '',
    status: 'active',
  });
  const [deptForm, setDeptForm] = useState({
    facultyId: '',
    departmentName: '',
    HOD: '',
    status: 'active',
  });
  const [programmeForm, setProgrammeForm] = useState({
    departmentId: '',
    programmeName: '',
    awardType: 'BSc Degree',
    durationYears: '4',
    status: 'active',
  });

  // Load Data strictly filtered by institutionId
  useEffect(() => {
    const fetchAllData = async () => {
      if (!institutionId || institutionId === 'N/A') {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const qFaculties = query(
          collection(db, 'faculties'),
          where('institutionId', '==', institutionId)
        );
        const qDepts = query(
          collection(db, 'departments'),
          where('institutionId', '==', institutionId)
        );
        const qProgs = query(
          collection(db, 'programmes'),
          where('institutionId', '==', institutionId)
        );

        const [fSnap, dSnap, pSnap] = await Promise.all([
          getDocs(qFaculties),
          getDocs(qDepts),
          getDocs(qProgs),
        ]);

        setFaculties(fSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setDepartments(dSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setProgrammes(pSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      } catch (error) {
        console.error('Error fetching academic structure:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [institutionId]);

  // General Create Handler with institutionId Protection
  const handleCreate = async (
    e,
    collectionName,
    formData,
    setFormState,
    initialFormState,
    setDataState
  ) => {
    e.preventDefault();

    if (!institutionId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please log in again.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {
        institutionId,
        ...formData,
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, collectionName), payload);

      if (collectionName === 'faculties' && formData.currentDean) {
        await addDoc(collection(db, `faculties/${docRef.id}/deanHistory`), {
          deanName: formData.currentDean,
          startDate: serverTimestamp(),
          endDate: null,
          status: 'active',
        });
      }

      setDataState((prev) => [
        ...prev,
        { id: docRef.id, ...payload },
      ]);
      setFormState(initialFormState);
      setMessage({ type: 'success', text: 'Record created successfully!' });
    } catch (err) {
      console.error(`Failed to create ${collectionName}:`, err);
      setMessage({ type: 'error', text: 'Failed to create record. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Update Handlers ---
  const handleUpdateDean = async (e) => {
    e.preventDefault();
    if (!selectedFacultyForDean || !newDeanName.trim()) return;

    if (selectedFacultyForDean.institutionId !== institutionId) {
      alert('You cannot modify records belonging to another institution.');
      return;
    }

    setSubmitting(true);
    try {
      const facultyRef = doc(db, 'faculties', selectedFacultyForDean.id);

      await updateDoc(facultyRef, { currentDean: newDeanName });

      await addDoc(
        collection(db, `faculties/${selectedFacultyForDean.id}/deanHistory`),
        {
          deanName: newDeanName,
          appointedAt: serverTimestamp(),
        }
      );

      setFaculties((prev) =>
        prev.map((f) =>
          f.id === selectedFacultyForDean.id
            ? { ...f, currentDean: newDeanName }
            : f
        )
      );

      setSelectedFacultyForDean(null);
      setNewDeanName('');
    } catch (err) {
      console.error('Failed to update dean:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateEntity = async (e) => {
    e.preventDefault();
    if (!itemToEdit) return;

    if (itemToEdit.institutionId && itemToEdit.institutionId !== institutionId) {
      alert('You cannot update records belonging to another institution.');
      return;
    }

    setSubmitting(true);
    const { id, type, data } = itemToEdit;

    try {
      const docRef = doc(db, type, id);
      await updateDoc(docRef, data);

      if (type === 'faculties') {
        setFaculties((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...data } : item))
        );
      } else if (type === 'departments') {
        setDepartments((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...data } : item))
        );
      } else if (type === 'programmes') {
        setProgrammes((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...data } : item))
        );
      }

      setItemToEdit(null);
    } catch (err) {
      console.error(`Failed to update ${type}:`, err);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Delete Handler ---
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    const { id, type, itemInstitutionId } = itemToDelete;

    if (itemInstitutionId !== institutionId) {
      alert('You cannot delete records belonging to another institution.');
      return;
    }

    setSubmitting(true);

    try {
      await deleteDoc(doc(db, type, id));

      if (type === 'faculties') {
        setFaculties((prev) => prev.filter((item) => item.id !== id));
      } else if (type === 'departments') {
        setDepartments((prev) => prev.filter((item) => item.id !== id));
      } else if (type === 'programmes') {
        setProgrammes((prev) => prev.filter((item) => item.id !== id));
      }

      setItemToDelete(null);
    } catch (err) {
      console.error(`Failed to delete document from ${type}:`, err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans">
      <div className="mb-8 flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Academic Hierarchy Setup
          </h1>
          <p className="text-sm text-gray-500">
            Active Institution ID:{' '}
            <span className="font-mono text-blue-600 font-semibold">{institutionId || 'N/A'}</span>
          </p>
        </div>
      </div>

      {message.text && (
        <div
          className={`p-3 mb-4 rounded text-xs font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-2">
        {[
          { key: 'faculties', label: 'Faculties / Schools' },
          { key: 'departments', label: 'Departments' },
          { key: 'programmes', label: 'Programmes & Awards' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500 text-sm">
          Loading structure for institution...
        </div>
      ) : (
        <>
          {/* FACULTIES TAB */}
          {activeTab === 'faculties' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <form
                onSubmit={(e) =>
                  handleCreate(
                    e,
                    'faculties',
                    facultyForm,
                    setFacultyForm,
                    {
                      facultyName: '',
                      code: '',
                      currentDean: '',
                      status: 'active',
                    },
                    setFaculties
                  )
                }
                className="bg-white p-5 border rounded-lg shadow-sm h-fit"
              >
                <h2 className="text-lg font-semibold mb-4">
                  Add Faculty / School
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Faculty / School Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., School of Technology"
                      required
                      value={facultyForm.facultyName}
                      onChange={(e) =>
                        setFacultyForm({
                          ...facultyForm,
                          facultyName: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Code / Abbreviation
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., SOT or FOS"
                      value={facultyForm.code}
                      onChange={(e) =>
                        setFacultyForm({
                          ...facultyForm,
                          code: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Initial Dean
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Prof. Samuel Kargbo"
                      value={facultyForm.currentDean}
                      onChange={(e) =>
                        setFacultyForm({
                          ...facultyForm,
                          currentDean: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <button
                    disabled={submitting}
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Faculty'}
                  </button>
                </div>
              </form>

              <div className="lg:col-span-2 bg-white border rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3">Faculty / School</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Current Dean</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {faculties.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center p-6 text-gray-500 text-xs">
                          No faculties found for this institution.
                        </td>
                      </tr>
                    ) : (
                      faculties.map((f) => (
                        <tr key={f.id}>
                          <td className="p-3 font-medium">{f.facultyName}</td>
                          <td className="p-3 font-mono text-xs">
                            {f.code || '—'}
                          </td>
                          <td className="p-3">{f.currentDean || 'Unassigned'}</td>
                          <td className="p-3 text-right space-x-2">
                            <button
                              onClick={() => setSelectedFacultyForDean(f)}
                              className="text-xs text-blue-600 hover:underline font-medium"
                            >
                              Dean
                            </button>
                            <button
                              onClick={() =>
                                setItemToEdit({
                                  id: f.id,
                                  type: 'faculties',
                                  institutionId: f.institutionId,
                                  data: {
                                    facultyName: f.facultyName,
                                    code: f.code || '',
                                  },
                                })
                              }
                              className="text-xs text-amber-600 hover:underline font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                setItemToDelete({
                                  id: f.id,
                                  type: 'faculties',
                                  name: f.facultyName,
                                  itemInstitutionId: f.institutionId,
                                })
                              }
                              className="text-xs text-red-600 hover:underline font-medium"
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
          )}

          {/* DEPARTMENTS TAB */}
          {activeTab === 'departments' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <form
                onSubmit={(e) =>
                  handleCreate(
                    e,
                    'departments',
                    deptForm,
                    setDeptForm,
                    {
                      facultyId: '',
                      departmentName: '',
                      HOD: '',
                      status: 'active',
                    },
                    setDepartments
                  )
                }
                className="bg-white p-5 border rounded-lg shadow-sm h-fit"
              >
                <h2 className="text-lg font-semibold mb-4">Add Department</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Parent Faculty / School
                    </label>
                    <select
                      required
                      value={deptForm.facultyId}
                      onChange={(e) =>
                        setDeptForm({ ...deptForm, facultyId: e.target.value })
                      }
                      className="w-full border p-2 rounded text-sm bg-white"
                    >
                      <option value="">-- Choose Faculty / School --</option>
                      {faculties.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.facultyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Department Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Computer Science, MIS"
                      required
                      value={deptForm.departmentName}
                      onChange={(e) =>
                        setDeptForm({
                          ...deptForm,
                          departmentName: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Head of Department (HOD)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Dr. Jane Doe"
                      value={deptForm.HOD}
                      onChange={(e) =>
                        setDeptForm({ ...deptForm, HOD: e.target.value })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <button
                    disabled={submitting}
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Department'}
                  </button>
                </div>
              </form>

              <div className="lg:col-span-2 bg-white border rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3">Department</th>
                      <th className="p-3">Parent Faculty/School</th>
                      <th className="p-3">HOD</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {departments.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center p-6 text-gray-500 text-xs">
                          No departments found for this institution.
                        </td>
                      </tr>
                    ) : (
                      departments.map((d) => {
                        const parent = faculties.find(
                          (f) => f.id === d.facultyId
                        );
                        return (
                          <tr key={d.id}>
                            <td className="p-3 font-medium">
                              {d.departmentName}
                            </td>
                            <td className="p-3 text-gray-600">
                              {parent?.facultyName || 'Unassigned'}
                            </td>
                            <td className="p-3">{d.HOD || 'Unassigned'}</td>
                            <td className="p-3 text-right space-x-2">
                              <button
                                onClick={() =>
                                  setItemToEdit({
                                    id: d.id,
                                    type: 'departments',
                                    institutionId: d.institutionId,
                                    data: {
                                      departmentName: d.departmentName,
                                      facultyId: d.facultyId || '',
                                      HOD: d.HOD || '',
                                    },
                                  })
                                }
                                className="text-xs text-amber-600 hover:underline font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() =>
                                  setItemToDelete({
                                    id: d.id,
                                    type: 'departments',
                                    name: d.departmentName,
                                    itemInstitutionId: d.institutionId,
                                  })
                                }
                                className="text-xs text-red-600 hover:underline font-medium"
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
          )}

          {/* PROGRAMMES TAB */}
          {activeTab === 'programmes' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <form
                onSubmit={(e) =>
                  handleCreate(
                    e,
                    'programmes',
                    programmeForm,
                    setProgrammeForm,
                    {
                      departmentId: '',
                      programmeName: '',
                      awardType: 'BSc Degree',
                      durationYears: '4',
                      status: 'active',
                    },
                    setProgrammes
                  )
                }
                className="bg-white p-5 border rounded-lg shadow-sm h-fit"
              >
                <h2 className="text-lg font-semibold mb-4">Add Programme</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Parent Department
                    </label>
                    <select
                      required
                      value={programmeForm.departmentId}
                      onChange={(e) =>
                        setProgrammeForm({
                          ...programmeForm,
                          departmentId: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded text-sm bg-white"
                    >
                      <option value="">-- Choose Department --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.departmentName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Programme Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Management Information Systems"
                      required
                      value={programmeForm.programmeName}
                      onChange={(e) =>
                        setProgrammeForm({
                          ...programmeForm,
                          programmeName: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Award Type
                    </label>
                    <select
                      value={programmeForm.awardType}
                      onChange={(e) =>
                        setProgrammeForm({
                          ...programmeForm,
                          awardType: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded text-sm bg-white"
                    >
                      <option value="Certificate">Certificate</option>
                      <option value="Diploma">Diploma</option>
                      <option value="Higher Diploma">Higher Diploma</option>
                      <option value="BSc Degree">BSc Degree</option>
                      <option value="Postgraduate Diploma">
                        Postgraduate Diploma
                      </option>
                      <option value="Master Degree">Master Degree</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Duration (Years)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      required
                      value={programmeForm.durationYears}
                      onChange={(e) =>
                        setProgrammeForm({
                          ...programmeForm,
                          durationYears: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <button
                    disabled={submitting}
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Programme'}
                  </button>
                </div>
              </form>

              <div className="lg:col-span-2 bg-white border rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3">Programme</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Award</th>
                      <th className="p-3">Duration</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {programmes.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center p-6 text-gray-500 text-xs">
                          No programmes found for this institution.
                        </td>
                      </tr>
                    ) : (
                      programmes.map((p) => {
                        const parent = departments.find(
                          (d) => d.id === p.departmentId
                        );
                        return (
                          <tr key={p.id}>
                            <td className="p-3 font-medium">{p.programmeName}</td>
                            <td className="p-3 text-gray-600">
                              {parent?.departmentName || 'Unassigned'}
                            </td>
                            <td className="p-3 font-semibold text-blue-700">
                              {p.awardType}
                            </td>
                            <td className="p-3">{p.durationYears} Year(s)</td>
                            <td className="p-3 text-right space-x-2">
                              <button
                                onClick={() =>
                                  setItemToEdit({
                                    id: p.id,
                                    type: 'programmes',
                                    institutionId: p.institutionId,
                                    data: {
                                      programmeName: p.programmeName,
                                      departmentId: p.departmentId || '',
                                      awardType: p.awardType || 'BSc Degree',
                                      durationYears: p.durationYears || '4',
                                    },
                                  })
                                }
                                className="text-xs text-amber-600 hover:underline font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() =>
                                  setItemToDelete({
                                    id: p.id,
                                    type: 'programmes',
                                    name: p.programmeName,
                                    itemInstitutionId: p.institutionId,
                                  })
                                }
                                className="text-xs text-red-600 hover:underline font-medium"
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
          )}
        </>
      )}

      {/* UPDATE DEAN MODAL */}
      {selectedFacultyForDean && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-lg">
            <h3 className="text-lg font-bold mb-2">
              Update Dean for {selectedFacultyForDean.facultyName}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Current Dean:{' '}
              <span className="font-semibold">
                {selectedFacultyForDean.currentDean || 'None'}
              </span>
            </p>
            <form onSubmit={handleUpdateDean} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  New Dean Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Prof. Alex Cole"
                  value={newDeanName}
                  onChange={(e) => setNewDeanName(e.target.value)}
                  className="w-full border p-2 rounded text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFacultyForDean(null)}
                  className="px-4 py-2 border rounded text-xs font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Confirm New Dean'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERAL EDIT MODAL */}
      {itemToEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-lg">
            <h3 className="text-lg font-bold mb-4 capitalize">
              Edit {itemToEdit.type.slice(0, -1)}
            </h3>
            <form onSubmit={handleUpdateEntity} className="space-y-4">
              {itemToEdit.type === 'faculties' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Faculty / School Name
                    </label>
                    <input
                      type="text"
                      required
                      value={itemToEdit.data.facultyName}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: {
                            ...itemToEdit.data,
                            facultyName: e.target.value,
                          },
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Code / Abbreviation
                    </label>
                    <input
                      type="text"
                      value={itemToEdit.data.code}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: { ...itemToEdit.data, code: e.target.value },
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                </>
              )}

              {itemToEdit.type === 'departments' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Parent Faculty
                    </label>
                    <select
                      required
                      value={itemToEdit.data.facultyId}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: { ...itemToEdit.data, facultyId: e.target.value },
                        })
                      }
                      className="w-full border p-2 rounded text-sm bg-white"
                    >
                      <option value="">-- Choose Faculty --</option>
                      {faculties.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.facultyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Department Name
                    </label>
                    <input
                      type="text"
                      required
                      value={itemToEdit.data.departmentName}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: { ...itemToEdit.data, departmentName: e.target.value },
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      HOD
                    </label>
                    <input
                      type="text"
                      value={itemToEdit.data.HOD}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: { ...itemToEdit.data, HOD: e.target.value },
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                </>
              )}

              {itemToEdit.type === 'programmes' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Parent Department
                    </label>
                    <select
                      required
                      value={itemToEdit.data.departmentId}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: { ...itemToEdit.data, departmentId: e.target.value },
                        })
                      }
                      className="w-full border p-2 rounded text-sm bg-white"
                    >
                      <option value="">-- Choose Department --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.departmentName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Programme Name
                    </label>
                    <input
                      type="text"
                      required
                      value={itemToEdit.data.programmeName}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: { ...itemToEdit.data, programmeName: e.target.value },
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Award Type
                    </label>
                    <select
                      value={itemToEdit.data.awardType}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: { ...itemToEdit.data, awardType: e.target.value },
                        })
                      }
                      className="w-full border p-2 rounded text-sm bg-white"
                    >
                      <option value="Certificate">Certificate</option>
                      <option value="Diploma">Diploma</option>
                      <option value="Higher Diploma">Higher Diploma</option>
                      <option value="BSc Degree">BSc Degree</option>
                      <option value="Postgraduate Diploma">Postgraduate Diploma</option>
                      <option value="Master Degree">Master Degree</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Duration (Years)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      required
                      value={itemToEdit.data.durationYears}
                      onChange={(e) =>
                        setItemToEdit({
                          ...itemToEdit,
                          data: { ...itemToEdit.data, durationYears: e.target.value },
                        })
                      }
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setItemToEdit(null)}
                  className="px-4 py-2 border rounded text-xs font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg space-y-4">
            <h3 className="text-lg font-bold text-red-600">Confirm Deletion</h3>
            <p className="text-xs text-gray-600">
              Are you sure you want to delete <span className="font-semibold text-gray-800">{itemToDelete.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 border rounded text-xs font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}