//app/setup/register-institute

"use client";

import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/app/lib/firebase"; 
import CloudinaryImageUploader from "@/app/(portal)/CaptureCamera/CloudinaryImageUploader";
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy 
} from "firebase/firestore";

const InstitutionSetup = () => {
  // =========================
  // STATE MANAGEMENT
  // =========================
  const [formData, setFormData] = useState({
    institutionID: "",
    institutionName: "",
    institutionType: "",
    institutionAddress: "",
    institutionMotto: "",
    institutionContact: "",
    headName: "",
    email: "",
    logoUrl: "", // Added to store the Cloudinary link
    registrationDate: new Date().toISOString().slice(0, 10),
  });

  const [institutions, setInstitutions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // =========================
  // INITIALIZATION & FETCHING
  // =========================
  useEffect(() => {
    setIsMounted(true);
    setFormData(prev => ({
      ...prev,
      institutionID: uuidv4()
    }));
    fetchInstitutions();
  }, []);

  const fetchInstitutions = async () => {
    try {
      const q = query(collection(db, "institutions"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id, 
      }));
      setInstitutions(data);
    } catch (error) {
      console.error("Error fetching institutions:", error);
    }
  };

  // =========================
  // HANDLERS
  // =========================
  const handleUploadSuccess = (url) => {
    setFormData(prev => ({ ...prev, logoUrl: url }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      institutionID: uuidv4(),
      institutionName: "",
      institutionType: "",
      institutionAddress: "",
      institutionMotto: "",
      institutionContact: "",
      headName: "",
      email: "",
      logoUrl: "",
      registrationDate: new Date().toISOString().slice(0, 10),
    });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.institutionName || !formData.institutionType) {
      alert("Please fill in the Institution Name and Type");
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        const docRef = doc(db, "institutions", editingId);
        await updateDoc(docRef, {
          ...formData,
          updatedAt: serverTimestamp(),
        });
        alert("Institution updated successfully!");
      } else {
        await addDoc(collection(db, "institutions"), {
          ...formData,
          createdAt: serverTimestamp(),
        });
        alert("Institution registered successfully!");
      }
      resetForm();
      fetchInstitutions();
    } catch (error) {
      console.error("Error saving to Firestore:", error);
      alert("Failed to save data. Check your Firebase rules.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (inst) => {
    const { id, createdAt, updatedAt, ...cleanData } = inst;
    setFormData(cleanData);
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this institution?")) {
      try {
        await deleteDoc(doc(db, "institutions", id));
        fetchInstitutions();
      } catch (error) {
        console.error("Error deleting document:", error);
      }
    }
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto">
        
        {/* FORM CARD */}
        <form
          onSubmit={handleSubmit}
          className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/60 border border-slate-100 space-y-6"
        >
          <div className="text-center mb-6">
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">
              {editingId ? "Update Institution" : "CEO Institution Setup"}
            </h2>
            <p className="text-slate-500 text-sm italic tracking-wide">
              UniPortal SL &bull; Cloud Integrated Portal
            </p>
          </div>

          {/* LOGO UPLOAD SECTION */}
          <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-[2rem] border border-slate-100 gap-4">
            <div className="w-24 h-24 bg-white rounded-3xl shadow-inner flex items-center justify-center overflow-hidden border border-slate-200">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo Preview" className="w-full h-full object-contain" />
              ) : (
                <span className="text-3xl">🏛️</span>
              )}
            </div>
            <div className="w-full max-w-xs">
              <CloudinaryImageUploader 
                onUploadSuccess={handleUploadSuccess}
                schoolId={formData.institutionName.replace(/\s+/g, '_') || "Portal_Setup"}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-2">System Generated UUID</label>
              <div className="w-full p-4 bg-slate-100 text-slate-500 rounded-2xl font-mono text-xs break-all border border-slate-200">
                {formData.institutionID || "Initializing..."}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase ml-2">Institution Name</label>
              <input
                name="institutionName"
                placeholder="e.g. University of Sierra Leone"
                value={formData.institutionName}
                onChange={handleChange}
                className="w-full p-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 ring-blue-500 transition-all border border-transparent focus:bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase ml-2">Category Type</label>
              <select
                name="institutionType"
                value={formData.institutionType}
                onChange={handleChange}
                className="w-full p-4 bg-slate-50 rounded-2xl outline-none appearance-none cursor-pointer border border-transparent focus:ring-2 ring-blue-500"
              >
                <option value="">Select Category</option>
                <option value="University">University</option>
                <option value="College">College</option>
                <option value="Vocational">Vocational / Technical</option>
              </select>
            </div>

            <input
              name="headName"
              placeholder="Head / Rector / Vice Chancellor"
              value={formData.headName}
              onChange={handleChange}
              className="p-4 bg-slate-50 rounded-2xl outline-none border border-transparent focus:bg-white focus:ring-2 ring-blue-500"
            />

            <input
              name="email"
              type="email"
              placeholder="Official Email Address"
              value={formData.email}
              onChange={handleChange}
              className="p-4 bg-slate-50 rounded-2xl outline-none border border-transparent focus:bg-white focus:ring-2 ring-blue-500"
            />

            <input
              name="institutionAddress"
              placeholder="Full Campus Location"
              value={formData.institutionAddress}
              onChange={handleChange}
              className="p-4 bg-slate-50 rounded-2xl outline-none md:col-span-2 border border-transparent focus:bg-white focus:ring-2 ring-blue-500"
            />

            <input
              name="institutionContact"
              placeholder="Contact Number"
              value={formData.institutionContact}
              onChange={handleChange}
              className="p-4 bg-slate-50 rounded-2xl outline-none border border-transparent focus:bg-white focus:ring-2 ring-blue-500"
            />

            <input
              name="institutionMotto"
              placeholder="Institution Motto"
              value={formData.institutionMotto}
              onChange={handleChange}
              className="p-4 bg-slate-50 rounded-2xl outline-none border border-transparent focus:bg-white focus:ring-2 ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-slate-900 transition-all shadow-lg shadow-blue-100 uppercase tracking-widest text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
              {loading ? "SAVING..." : editingId ? "UPDATE RECORD" : "DEPLOY PORTAL INSTANCE"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-8 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-colors"
              >
                CANCEL
              </button>
            )}
          </div>
        </form>

        {/* REGISTRY LIST */}
        <div className="mt-12 space-y-4 pb-10">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">
            Active Institution Registry ({institutions.length})
          </h3>
          
          {institutions.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
              <p className="text-slate-400 font-bold">No portals deployed yet.</p>
            </div>
          ) : (
            institutions.map((inst) => (
              <div
                key={inst.id}
                className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 transition-all hover:shadow-md hover:border-blue-100"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                    {inst.logoUrl ? (
                      <img src={inst.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xl">🏛️</span>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-lg leading-tight text-slate-800">{inst.institutionName}</h4>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-[9px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md uppercase tracking-tighter">
                        {inst.institutionType}
                      </span>
                      <span className="text-[9px] font-mono px-2 py-0.5 bg-slate-100 text-slate-400 rounded-md">
                        ID: {inst.institutionID?.split('-')[0]}...
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleEdit(inst)}
                    className="text-xs font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-xl transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(inst.id)}
                    className="text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors"
                  >
                    Delete
                  </button>
                  <button className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-xl shadow-lg active:scale-95 transition-all hover:bg-blue-600">
                    Setup Admin
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default InstitutionSetup;