'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';

const STUDY_LEVELS = ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Diploma', 'Certificate', 'Postgraduate / Masters'];

export default function LecturerTeachingAllocationPage() {
  const { user } = useAuth();

  // Retrieve institutionID from Auth Context session dynamically
  const schoolId = 
    user?.institutionID || 
    user?.schoolId || 
    user?.data?.institutionID || 
    user?.data?.schoolId || 
    '';

  // Step 1: Lecturer & Programme Selection State
  const [selectedLecturerId, setSelectedLecturerId] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programmeId, setProgrammeId] = useState('');
  const [studyLevel, setStudyLevel] = useState(STUDY_LEVELS[0]);

  // Allocation State
  const [selectedModuleIds, setSelectedModuleIds] = useState([]);
  const [editingAllocationId, setEditingAllocationId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Database Data Stores
  const [semesters, setSemesters] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [academicStaff, setAcademicStaff] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [masterModules, setMasterModules] = useState([]);
  const [existingAllocations, setExistingAllocations] = useState([]);

  // Fetch Baseline Data filtered by schoolId
  useEffect(() => {
    const fetchBaseData = async () => {
      if (!schoolId) return;

      try {
        const [
          semSnap,
          facSnap,
          deptSnap,
          progSnap,
          staffSnap,
          offeringSnap,
          moduleSnap,
          progModuleSnap,
          allocSnap,
        ] = await Promise.all([
          getDocs(query(collection(db, 'semesters'), where('institutionId', '==', schoolId))),
          getDocs(query(collection(db, 'faculties'), where('institutionId', '==', schoolId))),
          getDocs(query(collection(db, 'departments'), where('institutionId', '==', schoolId))),
          getDocs(query(collection(db, 'programmes'), where('institutionId', '==', schoolId))),
          getDocs(query(collection(db, 'staff'), where('institutionID', '==', schoolId), where('staffType', '==', 'Academic Staff'))),
          getDocs(query(collection(db, 'programme_module_offerings'), where('institutionId', '==', schoolId))),
          getDocs(query(collection(db, 'modules'), where('institutionId', '==', schoolId))),
          getDocs(query(collection(db, 'programme_modules'), where('institutionId', '==', schoolId))),
          getDocs(query(collection(db, 'lecturer_module_allocations'), where('institutionId', '==', schoolId))),
        ]);

        const semList = semSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const facList = facSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const deptList = deptSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const progList = progSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const staffList = staffSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const offeringList = offeringSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const allocList = allocSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const rawModules = [
          ...moduleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...progModuleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ];

        const combinedModules = Array.from(
          new Map(rawModules.map((m) => [m.id, m])).values()
        );

        setSemesters(semList);
        setFaculties(facList);
        setDepartments(deptList);
        setProgrammes(progList);
        setAcademicStaff(staffList);
        setOfferings(offeringList);
        setMasterModules(combinedModules);
        setExistingAllocations(allocList);

        if (staffList.length > 0) setSelectedLecturerId(staffList[0].id);
        if (semList.length > 0) {
          setAcademicYear(semList[0].academicYear || '2025/2026');
          setSemesterId(semList[0].id);
        }
        if (progList.length > 0) setProgrammeId(progList[0].id);
      } catch (err) {
        console.error('Error fetching baseline data:', err);
      }
    };

    fetchBaseData();
  }, [schoolId]);

  // Lookups Maps
  const modulesMap = useMemo(() => {
    const map = new Map();
    masterModules.forEach((m) => map.set(m.id, m));
    return map;
  }, [masterModules]);

  const staffMap = useMemo(() => {
    const map = new Map();
    academicStaff.forEach((s) => map.set(s.id, s));
    return map;
  }, [academicStaff]);

  const departmentsMap = useMemo(() => {
    const map = new Map();
    departments.forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  const programmesMap = useMemo(() => {
    const map = new Map();
    programmes.forEach((p) => map.set(p.id, p));
    return map;
  }, [programmes]);

  const availableYears = useMemo(() => {
    const years = [...new Set(semesters.map((s) => s.academicYear).filter(Boolean))];
    return years.length > 0 ? years : ['2025/2026'];
  }, [semesters]);

  const filteredSemesters = useMemo(() => {
    if (!academicYear) return semesters;
    return semesters.filter((s) => s.academicYear === academicYear);
  }, [semesters, academicYear]);

  // Dynamic Relations Filtering
  const filteredDepartments = useMemo(() => {
    if (!facultyId) return departments;
    return departments.filter((d) => d.facultyId === facultyId || d.faculty === facultyId);
  }, [departments, facultyId]);

  const filteredProgrammes = useMemo(() => {
    let progs = programmes;
    if (facultyId) {
      const validDeptIds = filteredDepartments.map((d) => d.id);
      progs = progs.filter(
        (p) =>
          validDeptIds.includes(p.departmentId) ||
          validDeptIds.includes(p.department) ||
          p.facultyId === facultyId ||
          p.faculty === facultyId
      );
    }
    if (departmentId) {
      progs = progs.filter((p) => p.departmentId === departmentId || p.department === departmentId);
    }
    return progs;
  }, [programmes, filteredDepartments, facultyId, departmentId]);

  // Get active modules based on selected Programme + Study Level
  const availableProgrammeModules = useMemo(() => {
    if (!programmeId) return [];

    const targetOffering = offerings.find(
      (o) =>
        o.programmeId === programmeId &&
        o.studyLevel === studyLevel &&
        (!semesterId || o.semesterId === semesterId)
    );

    if (targetOffering && targetOffering.moduleIds && targetOffering.moduleIds.length > 0) {
      return targetOffering.moduleIds.map((id) => modulesMap.get(id)).filter(Boolean);
    }

    return masterModules.filter(
      (m) =>
        (m.programmeId === programmeId || m.programme === programmeId) &&
        (!studyLevel || m.studyLevel === studyLevel || !m.studyLevel)
    );
  }, [offerings, programmeId, studyLevel, semesterId, masterModules, modulesMap]);

  // Selected Programme metadata & Resolved Department
  const currentProgramme = useMemo(() => {
    return programmesMap.get(programmeId) || null;
  }, [programmesMap, programmeId]);

  const currentProgrammeDept = useMemo(() => {
    if (!currentProgramme) return null;
    const deptId = currentProgramme.departmentId || currentProgramme.department;
    return departmentsMap.get(deptId) || null;
  }, [currentProgramme, departmentsMap]);

  const toggleModuleSelection = (id) => {
    setSelectedModuleIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedModuleIds.length === availableProgrammeModules.length) {
      setSelectedModuleIds([]);
    } else {
      setSelectedModuleIds(availableProgrammeModules.map((m) => m.id));
    }
  };

  const handleSaveAllocation = async (e) => {
    e.preventDefault();

    if (!schoolId) {
      setMessage({ type: 'error', text: 'Institution ID is missing. Please re-login.' });
      return;
    }
    if (!selectedLecturerId) {
      setMessage({ type: 'error', text: 'Please select an academic staff member.' });
      return;
    }
    if (!programmeId) {
      setMessage({ type: 'error', text: 'Please select a programme.' });
      return;
    }
    if (selectedModuleIds.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one module to assign.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    // Retrieve staff details object to attach fullName and staffId
    const selectedStaffDoc = staffMap.get(selectedLecturerId);
    const titleStr = selectedStaffDoc?.title ? `${selectedStaffDoc.title} ` : '';
    const staffFullName = 
      selectedStaffDoc?.fullName 
        ? `${titleStr}${selectedStaffDoc.fullName}`
        : `${selectedStaffDoc?.firstName || ''} ${selectedStaffDoc?.lastName || ''}`.trim() || 'Unknown Staff';

    const staffIdentificationId = 
      selectedStaffDoc?.staffId || 
      selectedStaffDoc?.staffID || 
      selectedStaffDoc?.id || 
      selectedLecturerId;

    const resolvedDeptId =
      currentProgrammeDept?.id ||
      departmentId ||
      currentProgramme?.departmentId ||
      currentProgramme?.department ||
      '';

    const payload = {
      institutionId: schoolId,
      academicYear: academicYear || '2025/2026',
      semesterId: semesterId || '',
      facultyId: facultyId || currentProgramme?.facultyId || '',
      departmentId: resolvedDeptId,
      programmeId,
      studyLevel,
      lecturerId: selectedLecturerId,
      fullName: staffFullName,
      staffId: staffIdentificationId,
      moduleIds: selectedModuleIds,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingAllocationId) {
        await updateDoc(doc(db, 'lecturer_module_allocations', editingAllocationId), payload);
        setExistingAllocations((prev) =>
          prev.map((a) => (a.id === editingAllocationId ? { ...a, ...payload } : a))
        );
        setMessage({ type: 'success', text: 'Lecturer teaching allocation updated successfully!' });
      } else {
        const docRef = await addDoc(collection(db, 'lecturer_module_allocations'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setExistingAllocations((prev) => [...prev, { id: docRef.id, ...payload }]);
        setMessage({ type: 'success', text: 'Lecturer teaching allocation saved successfully!' });
      }

      setEditingAllocationId(null);
      setSelectedModuleIds([]);
    } catch (err) {
      console.error('Error saving allocation:', err);
      setMessage({ type: 'error', text: 'Failed to save teaching allocation. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditAllocation = (alloc) => {
    setEditingAllocationId(alloc.id);
    setSelectedLecturerId(alloc.lecturerId);
    setAcademicYear(alloc.academicYear || '');
    setSemesterId(alloc.semesterId || '');
    setFacultyId(alloc.facultyId || '');
    setDepartmentId(alloc.departmentId || '');
    setProgrammeId(alloc.programmeId);
    setStudyLevel(alloc.studyLevel || STUDY_LEVELS[0]);
    setSelectedModuleIds(alloc.moduleIds || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAllocation = async (id) => {
    if (!confirm('Are you sure you want to remove this lecturer teaching assignment?')) return;

    try {
      await deleteDoc(doc(db, 'lecturer_module_allocations', id));
      setExistingAllocations((prev) => prev.filter((a) => a.id !== id));
      setMessage({ type: 'success', text: 'Allocation deleted successfully.' });
    } catch (err) {
      console.error('Error deleting allocation:', err);
      setMessage({ type: 'error', text: 'Failed to delete allocation.' });
    }
  };

  // Filter existing allocations for table view matching current schoolId
  const currentFilteredAllocations = useMemo(() => {
    return existingAllocations.filter((a) => {
      if (schoolId && a.institutionId && a.institutionId !== schoolId) return false;
      if (selectedLecturerId && a.lecturerId !== selectedLecturerId) return false;
      if (programmeId && a.programmeId !== programmeId) return false;
      return true;
    });
  }, [existingAllocations, schoolId, selectedLecturerId, programmeId]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="border-b pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Lecturer Teaching Allocation</h1>
          <p className="text-sm text-gray-500">
            Select a lecturer, pick their programme and study level, then check the modules they are assigned to teach.
          </p>
        </div>
        <div className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200">
          Institution ID: <span className="font-mono">{schoolId || 'N/A'}</span>
        </div>
      </div>

      {message.text && (
        <div
          className={`p-4 rounded-lg text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* FORM: ALLOCATIONS CHECKLIST */}
      <form onSubmit={handleSaveAllocation} className="bg-white p-6 border rounded-lg shadow-sm space-y-6">
        <div className="border-b pb-4">
          <h2 className="text-md font-semibold text-gray-800">
            {editingAllocationId ? 'Edit Lecturer Teaching Assignment' : 'Assign Modules to Lecturer'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Step 1: Choose the lecturer &gt; Step 2: Select Programme &amp; Level &gt; Step 3: Check Modules</p>
        </div>

        {/* STEP 1: SELECT LECTURER */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-lg border">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Select Lecturer (Academic Staff Only) *
            </label>
            <select
              value={selectedLecturerId}
              onChange={(e) => setSelectedLecturerId(e.target.value)}
              required
              className="w-full border p-2.5 rounded text-sm bg-white font-medium border-blue-300 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Choose Lecturer --</option>
              {academicStaff.map((staff) => {
                const titleStr = staff.title ? `${staff.title} ` : '';
                const displayName = staff.fullName
                  ? `${titleStr}${staff.fullName}`
                  : `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Unnamed Staff';

                return (
                  <option key={staff.id} value={staff.id}>
                    {displayName} ({staff.designation || 'Lecturer'})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Academic Year</label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full border p-2.5 rounded text-sm bg-white"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Semester / Term</label>
              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="w-full border p-2.5 rounded text-sm bg-white"
              >
                <option value="">-- Optional Term --</option>
                {filteredSemesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.semesterName || s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* STEP 2: SELECT PROGRAMME & LEVEL */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
          <div>
            <label className="block text-xs font-semibold text-indigo-900 mb-1">Faculty Filter</label>
            <select
              value={facultyId}
              onChange={(e) => {
                setFacultyId(e.target.value);
                setDepartmentId('');
              }}
              className="w-full border p-2 rounded text-sm bg-white"
            >
              <option value="">All Faculties</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.facultyName || f.name || f.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-indigo-900 mb-1">Department Filter</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full border p-2 rounded text-sm bg-white"
            >
              <option value="">All Departments</option>
              {filteredDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.departmentName || d.name || d.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-indigo-900 mb-1">Select Programme *</label>
            <select
              value={programmeId}
              onChange={(e) => setProgrammeId(e.target.value)}
              required
              className="w-full border p-2 rounded text-sm bg-white font-medium border-indigo-300"
            >
              <option value="">-- Choose Programme --</option>
              {filteredProgrammes.map((p) => {
                const progName = p.programmeName || p.title || p.name || 'Unnamed Programme';
                const awardType = p.awardType || p.award || p.degreeType || p.type || '';
                return (
                  <option key={p.id} value={p.id}>
                    {progName} {awardType ? `(${awardType})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-indigo-900 mb-1">Study Level *</label>
            <select
              value={studyLevel}
              onChange={(e) => setStudyLevel(e.target.value)}
              className="w-full border p-2 rounded text-sm bg-white font-medium text-blue-900 border-indigo-300"
            >
              {STUDY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* STEP 3: CHECK MODULES TO TEACH */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Modules Available in Programme ({availableProgrammeModules.length})
            </label>

            {availableProgrammeModules.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  {selectedModuleIds.length === availableProgrammeModules.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full font-mono font-medium">
                  {selectedModuleIds.length} Selected for Teaching
                </span>
              </div>
            )}
          </div>

          {!programmeId ? (
            <div className="py-8 text-center bg-gray-50 border border-dashed rounded-lg">
              <p className="text-sm font-medium text-gray-500">Please select a programme above to view its modules.</p>
            </div>
          ) : availableProgrammeModules.length === 0 ? (
            <div className="py-8 text-center bg-gray-50 border border-dashed rounded-lg space-y-1">
              <p className="text-sm font-medium text-gray-600">No modules found for {studyLevel} under this programme.</p>
              <p className="text-xs text-gray-400">
                Ensure modules have been added to this programme in master curriculum settings.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[350px] overflow-y-auto p-1">
              {availableProgrammeModules.map((module) => {
                const isChecked = selectedModuleIds.includes(module.id);
                const moduleDept =
                  module.department ||
                  departmentsMap.get(module.departmentId)?.departmentName ||
                  departmentsMap.get(module.departmentId)?.name ||
                  currentProgrammeDept?.departmentName ||
                  '—';

                return (
                  <label
                    key={module.id}
                    onClick={() => toggleModuleSelection(module.id)}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-1 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-mono font-bold text-blue-800">{module.moduleCode || module.code}</p>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {moduleDept}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-800">{module.moduleTitle || module.title}</p>
                      <p className="text-xs text-gray-500">{module.creditHours || module.credits || 3} Credit Hrs</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-4 border-t flex justify-end gap-3">
          {editingAllocationId && (
            <button
              type="button"
              onClick={() => {
                setEditingAllocationId(null);
                setSelectedModuleIds([]);
              }}
              className="text-xs text-gray-600 hover:underline px-4 py-2"
            >
              Cancel Editing
            </button>
          )}

          <button
            type="submit"
            disabled={submitting || availableProgrammeModules.length === 0 || selectedModuleIds.length === 0}
            className="bg-blue-600 text-white px-8 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : editingAllocationId ? 'Update Teaching Assignment' : 'Save Lecturer Assignment'}
          </button>
        </div>
      </form>

      {/* ALLOCATIONS TABLE */}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden p-6 space-y-4">
        <div className="border-b pb-3 flex justify-between items-center">
          <div>
            <h2 className="text-md font-semibold text-gray-800">
              Assigned Lecturer Teaching Records ({currentFilteredAllocations.length})
            </h2>
            <p className="text-xs text-gray-500">
              Current teaching workload allocations saved in the system.
            </p>
          </div>
        </div>

        {currentFilteredAllocations.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">
            No teaching assignments match the selected filters.
          </p>
        ) : (
          <div className="space-y-4">
            {currentFilteredAllocations.map((alloc) => {
              const staff = staffMap.get(alloc.lecturerId);
              const titleStr = staff?.title ? `${staff.title} ` : '';
              const lecturerName = alloc.fullName || (staff
                ? staff.fullName
                  ? `${titleStr}${staff.fullName}`
                  : `${staff.firstName || ''} ${staff.lastName || ''}`.trim()
                : 'Unknown Lecturer');

              const prog = programmesMap.get(alloc.programmeId);
              const progName = prog ? (prog.programmeName || prog.title || prog.name) : '';
              const awardType = prog ? (prog.awardType || prog.award || prog.degreeType || prog.type) : '';

              const assignedModules = (alloc.moduleIds || [])
                .map((id) => modulesMap.get(id))
                .filter(Boolean);

              return (
                <div key={alloc.id} className="border rounded-lg p-4 space-y-3 bg-slate-50/50">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-800">{lecturerName}</h3>
                        {progName && (
                          <span className="text-[11px] font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                            {progName} {awardType ? `• ${awardType}` : ''} ({alloc.studyLevel})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Staff ID: <span className="font-mono font-semibold">{alloc.staffId || staff?.staffId || staff?.staffID || 'N/A'}</span> &bull; {assignedModules.length} Modules Assigned &bull; {alloc.academicYear}
                      </p>
                    </div>

                    <div className="space-x-3">
                      <button
                        onClick={() => handleEditAllocation(alloc)}
                        className="text-xs text-blue-600 font-medium hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAllocation(alloc.id)}
                        className="text-xs text-red-600 font-medium hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border rounded overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-100 border-b font-semibold text-gray-600">
                        <tr>
                          <th className="p-2.5">Code</th>
                          <th className="p-2.5">Module Title</th>
                          <th className="p-2.5">Department</th>
                          <th className="p-2.5">Credit Weight</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {assignedModules.map((m) => {
                          const resolvedDeptName =
                            m.department ||
                            departmentsMap.get(m.departmentId)?.departmentName ||
                            departmentsMap.get(m.departmentId)?.name ||
                            currentProgrammeDept?.departmentName ||
                            '—';

                          return (
                            <tr key={m.id}>
                              <td className="p-2.5 font-mono font-bold text-blue-700">{m.moduleCode || m.code}</td>
                              <td className="p-2.5 font-medium text-gray-800">{m.moduleTitle || m.title}</td>
                              <td className="p-2.5 text-gray-600">{resolvedDeptName}</td>
                              <td className="p-2.5 text-gray-500">{m.creditHours || m.credits || 3} Hrs</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}