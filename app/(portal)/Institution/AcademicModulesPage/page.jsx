'use client';
//app/(portal)/Institution/AcademicModules/page.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

const STUDY_LEVELS = [
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'Postgraduate / Masters',
];

export default function AcademicModulesPage() {
  const { user } = useAuth();

  // ✅ Retrieve institutionID from Auth Context session dynamically
  const institutionId = user?.institutionID || user?.schoolId || user?.data?.institutionID || user?.data?.schoolId || '';

  const [activeTab, setActiveTab] = useState('curriculum');

  // Core Data
  const [programmes, setProgrammes] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [allModules, setAllModules] = useState([]);
  const [allOfferings, setAllOfferings] = useState([]);

  // Tab 1 Filters & Form (Programme Modules)
  const [curriculumProgrammeId, setCurriculumProgrammeId] = useState('');
  const [curriculumStudyLevel, setCurriculumStudyLevel] = useState(STUDY_LEVELS[0]);
  const [editingModuleId, setEditingModuleId] = useState(null);
  const [moduleForm, setModuleForm] = useState({
    moduleCode: '',
    moduleTitle: '',
    creditHours: '3',
    department: '',
  });

  // Tab 2 Form (Semesters)
  const [editingSemesterId, setEditingSemesterId] = useState(null);
  const [semesterForm, setSemesterForm] = useState({
    academicYear: '2025/2026',
    semesterName: '',
    code: '',
    status: 'Active', // Active | Upcoming | Closed
  });

  // Tab 3 State (Term Course Allocation)
  const [offeringYear, setOfferingYear] = useState('');
  const [offeringSemesterId, setOfferingSemesterId] = useState('');
  const [offeringProgrammeId, setOfferingProgrammeId] = useState('');
  const [offeringStudyLevel, setOfferingStudyLevel] = useState(STUDY_LEVELS[0]);
  const [selectedModuleIds, setSelectedModuleIds] = useState([]);
  const [editingOfferingId, setEditingOfferingId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Extract unique academic years dynamically from configured semesters
  const availableAcademicYears = useMemo(() => {
    const years = semesters.map((s) => s.academicYear).filter(Boolean);
    return Array.from(new Set(years));
  }, [semesters]);

  // Sync default selection for offering year when semesters load
  useEffect(() => {
    if (availableAcademicYears.length > 0 && !offeringYear) {
      setOfferingYear(availableAcademicYears[0]);
    }
  }, [availableAcademicYears, offeringYear]);

  // Load Base Reference Data strictly filtered by institutionId
  useEffect(() => {
    const fetchBaseData = async () => {
      if (!institutionId || institutionId === 'N/A') {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const qSemesters = query(collection(db, 'semesters'), where('institutionId', '==', institutionId));
        const qProgrammes = query(collection(db, 'programmes'), where('institutionId', '==', institutionId));
        const qModules = query(collection(db, 'programme_modules'), where('institutionId', '==', institutionId));
        const qOfferings = query(collection(db, 'programme_module_offerings'), where('institutionId', '==', institutionId));

        const [sSnap, pSnap, mSnap, oSnap] = await Promise.all([
          getDocs(qSemesters),
          getDocs(qProgrammes),
          getDocs(qModules),
          getDocs(qOfferings),
        ]);

        const loadedSemesters = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedProgrammes = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedModules = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const loadedOfferings = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setSemesters(loadedSemesters);
        setProgrammes(loadedProgrammes);
        setAllModules(loadedModules);
        setAllOfferings(loadedOfferings);

        if (loadedProgrammes.length > 0) {
          setCurriculumProgrammeId(loadedProgrammes[0].id);
          setOfferingProgrammeId(loadedProgrammes[0].id);
        }
        if (loadedSemesters.length > 0) {
          const activeSem = loadedSemesters.find((s) => s.status === 'Active');
          setOfferingSemesterId(activeSem ? activeSem.id : loadedSemesters[0].id);
          if (activeSem) setOfferingYear(activeSem.academicYear);
        }
      } catch (err) {
        console.error('Error loading base academic data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBaseData();
  }, [institutionId]);

  // Filter semesters matching the selected academic year in Tab 3
  const filteredSemestersForYear = useMemo(() => {
    if (!offeringYear) return semesters;
    return semesters.filter((s) => s.academicYear === offeringYear);
  }, [semesters, offeringYear]);

  // Auto-select active or first matching semester when active year changes
  useEffect(() => {
    if (filteredSemestersForYear.length > 0) {
      const activeSem = filteredSemestersForYear.find((s) => s.status === 'Active');
      setOfferingSemesterId(activeSem ? activeSem.id : filteredSemestersForYear[0].id);
    } else {
      setOfferingSemesterId('');
    }
  }, [offeringYear, filteredSemestersForYear]);

  // Map module IDs to their respective objects for fast lookup
  const modulesMap = useMemo(() => {
    const map = new Map();
    allModules.forEach((m) => map.set(m.id, m));
    return map;
  }, [allModules]);

  // Filter existing course offerings for current filters in Tab 3
  const currentFilteredOfferings = useMemo(() => {
    return allOfferings.filter(
      (o) =>
        o.academicYear === offeringYear &&
        o.semesterId === offeringSemesterId &&
        o.programmeId === offeringProgrammeId &&
        o.studyLevel === offeringStudyLevel
    );
  }, [allOfferings, offeringYear, offeringSemesterId, offeringProgrammeId, offeringStudyLevel]);

  // ================= TAB 1 HANDLERS (PROGRAMME MODULES) =================
  const handleSaveCurriculumModule = async (e) => {
    e.preventDefault();
    if (!institutionId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please log in again.' });
      return;
    }
    if (!curriculumProgrammeId) return alert('Please select a Programme.');

    setSubmitting(true);
    setMessage({ type: '', text: '' });
    try {
      const selectedProgramme = programmes.find((p) => p.id === curriculumProgrammeId);

      if (editingModuleId) {
        const moduleToUpdate = allModules.find((m) => m.id === editingModuleId);
        if (moduleToUpdate?.institutionId && moduleToUpdate.institutionId !== institutionId) {
          alert('You cannot modify modules belonging to another institution.');
          return;
        }

        const docRef = doc(db, 'programme_modules', editingModuleId);
        const updatePayload = {
          ...moduleForm,
          programmeId: selectedProgramme.id,
          programmeName: selectedProgramme.programmeName,
          awardType: selectedProgramme.awardType || 'General',
          studyLevel: curriculumStudyLevel,
        };
        await updateDoc(docRef, updatePayload);

        setAllModules((prev) =>
          prev.map((m) => (m.id === editingModuleId ? { ...m, ...updatePayload } : m))
        );
        setEditingModuleId(null);
        setMessage({ type: 'success', text: 'Module updated successfully!' });
      } else {
        const payload = {
          institutionId,
          programmeId: selectedProgramme.id,
          programmeName: selectedProgramme.programmeName,
          awardType: selectedProgramme.awardType || 'General',
          studyLevel: curriculumStudyLevel,
          ...moduleForm,
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, 'programme_modules'), payload);
        setAllModules((prev) => [...prev, { id: docRef.id, ...payload }]);
        setMessage({ type: 'success', text: 'Module added to curriculum successfully!' });
      }

      setModuleForm({ moduleCode: '', moduleTitle: '', creditHours: '3', department: '' });
    } catch (err) {
      console.error('Failed to save module:', err);
      setMessage({ type: 'error', text: 'Failed to save module. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditModule = (m) => {
    setEditingModuleId(m.id);
    setCurriculumStudyLevel(m.studyLevel || STUDY_LEVELS[0]);
    setModuleForm({
      moduleCode: m.moduleCode || '',
      moduleTitle: m.moduleTitle || '',
      creditHours: m.creditHours || '3',
      department: m.department || '',
    });
  };

  const handleDeleteModule = async (id, code, itemInstitutionId) => {
    if (itemInstitutionId !== institutionId) {
      alert('You cannot delete records belonging to another institution.');
      return;
    }

    const confirmDelete = window.confirm(
      `⚠️ WARNING: Are you sure you want to delete module "${code}"?\n\nThis will permanently remove it from the master programme curriculum.`
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'programme_modules', id));
      setAllModules((prev) => prev.filter((m) => m.id !== id));
      if (editingModuleId === id) {
        setEditingModuleId(null);
        setModuleForm({ moduleCode: '', moduleTitle: '', creditHours: '3', department: '' });
      }
    } catch (err) {
      console.error('Failed to delete module:', err);
    }
  };

  // ================= TAB 2 HANDLERS (SEMESTERS) =================
  const handleSaveSemester = async (e) => {
    e.preventDefault();
    if (!institutionId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please log in again.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });
    try {
      if (editingSemesterId) {
        const semToUpdate = semesters.find((s) => s.id === editingSemesterId);
        if (semToUpdate?.institutionId && semToUpdate.institutionId !== institutionId) {
          alert('You cannot modify semesters belonging to another institution.');
          return;
        }

        const docRef = doc(db, 'semesters', editingSemesterId);
        await updateDoc(docRef, { ...semesterForm });

        setSemesters((prev) =>
          prev.map((s) => (s.id === editingSemesterId ? { ...s, ...semesterForm } : s))
        );
        setEditingSemesterId(null);
        setMessage({ type: 'success', text: 'Semester updated successfully!' });
      } else {
        const payload = {
          institutionId,
          ...semesterForm,
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, 'semesters'), payload);
        setSemesters((prev) => [...prev, { id: docRef.id, ...payload }]);
        setMessage({ type: 'success', text: 'Semester registered successfully!' });
      }

      setSemesterForm({ academicYear: '2025/2026', semesterName: '', code: '', status: 'Active' });
    } catch (err) {
      console.error('Failed to save semester:', err);
      setMessage({ type: 'error', text: 'Failed to save semester. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSemester = (s) => {
    setEditingSemesterId(s.id);
    setSemesterForm({
      academicYear: s.academicYear || '2025/2026',
      semesterName: s.semesterName || '',
      code: s.code || '',
      status: s.status || 'Active',
    });
  };

  const handleDeleteSemester = async (id, name, itemInstitutionId) => {
    if (itemInstitutionId !== institutionId) {
      alert('You cannot delete records belonging to another institution.');
      return;
    }

    const confirmDelete = window.confirm(
      `⚠️ WARNING: Are you sure you want to delete "${name}"?\n\nDeleting an academic term can cause course offerings assigned to this term to become unlinked.`
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'semesters', id));
      setSemesters((prev) => prev.filter((s) => s.id !== id));
      if (editingSemesterId === id) {
        setEditingSemesterId(null);
        setSemesterForm({ academicYear: '2025/2026', semesterName: '', code: '', status: 'Active' });
      }
    } catch (err) {
      console.error('Failed to delete semester:', err);
    }
  };

  // ================= TAB 3 HANDLERS (PROGRAMME MODULE OFFERINGS) =================
  const handleSaveOfferings = async (e) => {
    e.preventDefault();
    if (!institutionId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please log in again.' });
      return;
    }
    if (!offeringProgrammeId || !offeringSemesterId || selectedModuleIds.length === 0) {
      alert('Please select a Programme, Semester, Level, and at least one Module.');
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });
    try {
      const selectedProgramme = programmes.find((p) => p.id === offeringProgrammeId);

      if (editingOfferingId) {
        const offToUpdate = allOfferings.find((o) => o.id === editingOfferingId);
        if (offToUpdate?.institutionId && offToUpdate.institutionId !== institutionId) {
          alert('You cannot modify offerings belonging to another institution.');
          return;
        }

        const docRef = doc(db, 'programme_module_offerings', editingOfferingId);
        const updatePayload = {
          academicYear: offeringYear,
          semesterId: offeringSemesterId,
          programmeId: selectedProgramme.id,
          programmeName: selectedProgramme.programmeName,
          awardType: selectedProgramme.awardType || 'General',
          studyLevel: offeringStudyLevel,
          moduleIds: selectedModuleIds,
          updatedAt: serverTimestamp(),
        };
        await updateDoc(docRef, updatePayload);

        setAllOfferings((prev) =>
          prev.map((o) =>
            o.id === editingOfferingId ? { ...o, ...updatePayload } : o
          )
        );
        setEditingOfferingId(null);
        setMessage({ type: 'success', text: 'Course offering updated successfully!' });
      } else {
        const payload = {
          institutionId,
          academicYear: offeringYear,
          semesterId: offeringSemesterId,
          programmeId: selectedProgramme.id,
          programmeName: selectedProgramme.programmeName,
          awardType: selectedProgramme.awardType || 'General',
          studyLevel: offeringStudyLevel,
          moduleIds: selectedModuleIds,
          createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, 'programme_module_offerings'), payload);
        setAllOfferings((prev) => [...prev, { id: docRef.id, ...payload }]);
        setMessage({ type: 'success', text: 'Modules successfully allocated to this semester session!' });
      }

      setSelectedModuleIds([]);
    } catch (err) {
      console.error('Failed to save course offering:', err);
      setMessage({ type: 'error', text: 'Failed to save course allocation. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOffering = (offering) => {
    setEditingOfferingId(offering.id);
    setSelectedModuleIds(offering.moduleIds || []);
  };

  const handleDeleteOffering = async (id, itemInstitutionId) => {
    if (itemInstitutionId !== institutionId) {
      alert('You cannot delete records belonging to another institution.');
      return;
    }

    const confirmDelete = window.confirm(
      '⚠️ Are you sure you want to delete this term course allocation?'
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'programme_module_offerings', id));
      setAllOfferings((prev) => prev.filter((o) => o.id !== id));
      if (editingOfferingId === id) {
        setEditingOfferingId(null);
        setSelectedModuleIds([]);
      }
    } catch (err) {
      console.error('Failed to delete course offering:', err);
    }
  };

  const toggleModuleSelection = (id) => {
    setSelectedModuleIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  // Filter modules for Tab 1 table based on Programme AND Study Level
  const programmeCurriculumModules = allModules.filter(
    (m) => m.programmeId === curriculumProgrammeId && m.studyLevel === curriculumStudyLevel
  );

  // Modules available for allocation in Tab 3 (filtered by Programme + Study Level)
  const availableProgrammeModules = allModules.filter(
    (m) => m.programmeId === offeringProgrammeId && m.studyLevel === offeringStudyLevel
  );

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans">
      <div className="mb-8 flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Academic Curriculum & Course Allocation</h1>
          <p className="text-sm text-gray-500">
            Manage master programme modules, setup semester sessions with statuses, and allocate level-based term courses.
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500 text-right">
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

      {/* Primary Navigation Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-2">
        {[
          { key: 'curriculum', label: 'Programme Modules (Master)' },
          { key: 'semesters', label: 'Semester & Session Setup' },
          { key: 'offerings', label: 'Term Course Allocation' },
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
        <div className="py-12 text-center text-gray-500 text-sm">Loading academic structures for institution...</div>
      ) : (
        <>
          {/* TAB 1: MASTER PROGRAMME MODULES */}
          {activeTab === 'curriculum' && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-4 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-1">
                      Programme / Course
                    </label>
                    <select
                      value={curriculumProgrammeId}
                      onChange={(e) => {
                        setCurriculumProgrammeId(e.target.value);
                        setEditingModuleId(null);
                      }}
                      className="w-64 border p-2 rounded text-sm bg-white"
                    >
                      {programmes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.programmeName} ({p.awardType || 'General'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-1">
                      Year / Level of Study
                    </label>
                    <select
                      value={curriculumStudyLevel}
                      onChange={(e) => setCurriculumStudyLevel(e.target.value)}
                      className="w-56 border p-2 rounded text-sm bg-white"
                    >
                      {STUDY_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <span className="text-xs bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full font-mono font-medium">
                  {curriculumStudyLevel}: {programmeCurriculumModules.length} Modules
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form: Add/Edit Module */}
                <form onSubmit={handleSaveCurriculumModule} className="bg-white p-5 border rounded-lg shadow-sm space-y-4 h-fit">
                  <div className="flex justify-between items-center">
                    <h2 className="text-md font-semibold text-gray-800">
                      {editingModuleId ? 'Edit Master Module' : 'Add Module to Master List'}
                    </h2>
                    {editingModuleId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingModuleId(null);
                          setModuleForm({ moduleCode: '', moduleTitle: '', creditHours: '3', department: '' });
                        }}
                        className="text-xs text-gray-500 underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Module Code</label>
                    <input
                      type="text"
                      placeholder="e.g., MIS101 or ENG101"
                      required
                      value={moduleForm.moduleCode}
                      onChange={(e) => setModuleForm({ ...moduleForm, moduleCode: e.target.value })}
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Module Title</label>
                    <input
                      type="text"
                      placeholder="e.g., Intro to Information Systems"
                      required
                      value={moduleForm.moduleTitle}
                      onChange={(e) => setModuleForm({ ...moduleForm, moduleTitle: e.target.value })}
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Credit Hours / Weight</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={moduleForm.creditHours}
                      onChange={(e) => setModuleForm({ ...moduleForm, creditHours: e.target.value })}
                      className="w-full border p-2 rounded text-sm"
                    />
                  </div>
                  <button
                    disabled={submitting}
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : editingModuleId ? 'Update Module' : 'Save to Programme Curriculum'}
                  </button>
                </form>

                {/* Table: Modules List */}
                <div className="lg:col-span-2 bg-white border rounded-lg shadow-sm overflow-hidden">
                  <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-600 uppercase">
                      Curriculum: {curriculumStudyLevel}
                    </span>
                  </div>
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 border-b sticky top-0 z-10 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="p-3">Code</th>
                          <th className="p-3">Module Title</th>
                          <th className="p-3">Award Type</th>
                          <th className="p-3">Credits</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {programmeCurriculumModules.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="p-8 text-center text-gray-400 text-xs">
                              No modules cataloged for {curriculumStudyLevel} under this programme yet.
                            </td>
                          </tr>
                        ) : (
                          programmeCurriculumModules.map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50">
                              <td className="p-3 font-mono font-bold text-xs text-blue-700">{m.moduleCode}</td>
                              <td className="p-3 font-medium text-gray-800">{m.moduleTitle}</td>
                              <td className="p-3">
                                <span className="text-xs bg-gray-100 text-gray-700 font-semibold px-2 py-0.5 rounded">
                                  {m.awardType || 'General'}
                                </span>
                              </td>
                              <td className="p-3">{m.creditHours} Hrs</td>
                              <td className="p-3 text-right space-x-2">
                                <button
                                  onClick={() => handleEditModule(m)}
                                  className="text-xs text-blue-600 hover:underline font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteModule(m.id, m.moduleCode, m.institutionId)}
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
              </div>
            </div>
          )}

          {/* TAB 2: SEMESTER & SESSION SETUP */}
          {activeTab === 'semesters' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <form onSubmit={handleSaveSemester} className="bg-white p-5 border rounded-lg shadow-sm space-y-4 h-fit">
                <div className="flex justify-between items-center">
                  <h2 className="text-md font-semibold text-gray-800">
                    {editingSemesterId ? 'Edit Academic Term' : 'Add Academic Session / Term'}
                  </h2>
                  {editingSemesterId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSemesterId(null);
                        setSemesterForm({ academicYear: '2025/2026', semesterName: '', code: '', status: 'Active' });
                      }}
                      className="text-xs text-gray-500 underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Academic Year</label>
                  <input
                    type="text"
                    placeholder="e.g., 2025/2026"
                    required
                    value={semesterForm.academicYear}
                    onChange={(e) => setSemesterForm({ ...semesterForm, academicYear: e.target.value })}
                    className="w-full border p-2 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Semester / Term Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Semester One or First Term"
                    required
                    value={semesterForm.semesterName}
                    onChange={(e) => setSemesterForm({ ...semesterForm, semesterName: e.target.value })}
                    className="w-full border p-2 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Short Code</label>
                  <input
                    type="text"
                    placeholder="e.g., SEM1 or TERM1"
                    value={semesterForm.code}
                    onChange={(e) => setSemesterForm({ ...semesterForm, code: e.target.value })}
                    className="w-full border p-2 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Term Status</label>
                  <select
                    value={semesterForm.status}
                    onChange={(e) => setSemesterForm({ ...semesterForm, status: e.target.value })}
                    className="w-full border p-2 rounded text-sm bg-white"
                  >
                    <option value="Active">Active (Current)</option>
                    <option value="Upcoming">Upcoming</option>
                    <option value="Closed">Closed / Archived</option>
                  </select>
                </div>
                <button
                  disabled={submitting}
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingSemesterId ? 'Update Semester' : 'Register Semester'}
                </button>
              </form>

              <div className="lg:col-span-2 bg-white border rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="p-3">Academic Year</th>
                      <th className="p-3">Semester Name</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {semesters.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-6 text-center text-gray-400 text-xs">
                          No semester terms registered for this institution yet.
                        </td>
                      </tr>
                    ) : (
                      semesters.map((s) => (
                        <tr key={s.id}>
                          <td className="p-3 font-semibold text-gray-700">{s.academicYear || '—'}</td>
                          <td className="p-3 font-medium">{s.semesterName}</td>
                          <td className="p-3 font-mono text-xs">{s.code || '—'}</td>
                          <td className="p-3">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                s.status === 'Active'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : s.status === 'Upcoming'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {s.status || 'Active'}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-2">
                            <button
                              onClick={() => handleEditSemester(s)}
                              className="text-xs text-blue-600 hover:underline font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteSemester(s.id, s.semesterName, s.institutionId)}
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

          {/* TAB 3: TERM COURSE ALLOCATION */}
          {activeTab === 'offerings' && (
            <div className="space-y-6">
              {/* Context Selectors */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Academic Year
                  </label>
                  <select
                    value={offeringYear}
                    onChange={(e) => {
                      setOfferingYear(e.target.value);
                      setSelectedModuleIds([]);
                      setEditingOfferingId(null);
                    }}
                    className="w-full border p-2 rounded text-sm bg-white"
                  >
                    {availableAcademicYears.length === 0 ? (
                      <option value="">No sessions configured</option>
                    ) : (
                      availableAcademicYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Target Semester / Term
                  </label>
                  <select
                    value={offeringSemesterId}
                    onChange={(e) => {
                      setOfferingSemesterId(e.target.value);
                      setSelectedModuleIds([]);
                      setEditingOfferingId(null);
                    }}
                    className="w-full border p-2 rounded text-sm bg-white"
                  >
                    {filteredSemestersForYear.length === 0 ? (
                      <option value="">No terms in this year</option>
                    ) : (
                      filteredSemestersForYear.map((sem) => (
                        <option key={sem.id} value={sem.id}>
                          {sem.semesterName} ({sem.status})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Programme / Course
                  </label>
                  <select
                    value={offeringProgrammeId}
                    onChange={(e) => {
                      setOfferingProgrammeId(e.target.value);
                      setSelectedModuleIds([]);
                      setEditingOfferingId(null);
                    }}
                    className="w-full border p-2 rounded text-sm bg-white"
                  >
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.programmeName} ({p.awardType || 'General'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Study Level / Year
                  </label>
                  <select
                    value={offeringStudyLevel}
                    onChange={(e) => {
                      setOfferingStudyLevel(e.target.value);
                      setSelectedModuleIds([]);
                      setEditingOfferingId(null);
                    }}
                    className="w-full border p-2 rounded text-sm bg-white"
                  >
                    {STUDY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Available Master Modules Selection Box */}
                <div className="bg-white p-5 border rounded-lg shadow-sm flex flex-col h-[500px]">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-md font-semibold text-gray-800">
                      1. Select Modules to Allocate ({availableProgrammeModules.length} available)
                    </h2>
                    <span className="text-xs text-blue-600 font-semibold">
                      {selectedModuleIds.length} Selected
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Check the modules from the master curriculum for <span className="font-medium text-gray-700">{offeringStudyLevel}</span> to offer in the selected semester.
                  </p>

                  <div className="flex-1 overflow-y-auto border rounded divide-y bg-gray-50">
                    {availableProgrammeModules.length === 0 ? (
                      <div className="p-8 text-center text-xs text-gray-400">
                        No modules found in the master curriculum for this programme and study level. Go to the "Programme Modules" tab to add them first.
                      </div>
                    ) : (
                      availableProgrammeModules.map((m) => {
                        const isSelected = selectedModuleIds.includes(m.id);
                        return (
                          <div
                            key={m.id}
                            onClick={() => toggleModuleSelection(m.id)}
                            className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : 'bg-white hover:bg-gray-100'
                            }`}
                          >
                            <div>
                              <p className="text-xs font-mono font-bold text-blue-700">{m.moduleCode}</p>
                              <p className="text-sm font-medium text-gray-800">{m.moduleTitle}</p>
                              <p className="text-[11px] text-gray-500">{m.creditHours} Credit Hours</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Handled by div click
                              className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t">
                    <button
                      type="button"
                      disabled={submitting || availableProgrammeModules.length === 0}
                      onClick={handleSaveOfferings}
                      className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting ? 'Saving Allocation...' : editingOfferingId ? 'Update Term Course Offering' : 'Allocate Selected Modules to Term'}
                    </button>
                  </div>
                </div>

                {/* Existing Term Allocations List */}
                <div className="bg-white p-5 border rounded-lg shadow-sm flex flex-col h-[500px]">
                  <h2 className="text-md font-semibold text-gray-800 mb-3">
                    2. Active Term Allocations
                  </h2>
                  <p className="text-xs text-gray-500 mb-3">
                    Course modules currently scheduled and open for student registration during this term session.
                  </p>

                  <div className="flex-1 overflow-y-auto border rounded divide-y bg-gray-50">
                    {currentFilteredOfferings.length === 0 ? (
                      <div className="p-8 text-center text-xs text-gray-400">
                        No module allocations found for the selected year, term, and programme level.
                      </div>
                    ) : (
                      currentFilteredOfferings.map((offering) => (
                        <div key={offering.id} className="p-4 bg-white space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                                {offering.studyLevel}
                              </span>
                              <p className="text-xs text-gray-500 mt-1">
                                {offering.moduleIds?.length || 0} Modules Allocated
                              </p>
                            </div>
                            <div className="space-x-2">
                              <button
                                onClick={() => handleEditOffering(offering)}
                                className="text-xs text-blue-600 hover:underline font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteOffering(offering.id, offering.institutionId)}
                                className="text-xs text-red-600 hover:underline font-medium"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1 pl-2 border-l-2 border-gray-200">
                            {offering.moduleIds?.map((mId) => {
                              const mod = modulesMap.get(mId);
                              if (!mod) return null;
                              return (
                                <div key={mId} className="text-xs flex justify-between text-gray-700">
                                  <span className="font-mono font-medium text-blue-700">{mod.moduleCode}</span>
                                  <span className="truncate max-w-[220px] text-gray-600">{mod.moduleTitle}</span>
                                  <span className="text-gray-400">{mod.creditHours} Cr</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}