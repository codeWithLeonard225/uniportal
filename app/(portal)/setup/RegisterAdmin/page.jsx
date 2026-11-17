//app/setup/register-admin
"use client";

import React, { useState, useEffect } from "react";
import {
    collection,
    getDocs,
    query,
    where,
    doc,
    updateDoc,
    deleteDoc,
    setDoc,
    orderBy
} from "firebase/firestore";
import { db } from "@/app/lib/firebase"; 

const ADMIN_PASSWORD = "superadmin";



const AdminRegistration = () => {
    // --- ADMIN STATE ---
    const [formData, setFormData] = useState({
        adminID: "",
        adminName: "",
        institutionID: "",
        institutionName: "",
        adminType: "",
        role: ""
    });
    
    const [admins, setAdmins] = useState([]);
    const [institutions, setInstitutions] = useState([]); // To link with Stage 1
    const [editingId, setEditingId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loading, setLoading] = useState(false);



    // ==========================================
    // INITIAL FETCH
    // ==========================================
    useEffect(() => {
        fetchAdmins();
    
        fetchInstitutions(); // Fetch schools created in Stage 1
    }, []);

    const fetchInstitutions = async () => {
        const q = query(collection(db, "institutions"), orderBy("institutionName"));
        const snapshot = await getDocs(q);
        setInstitutions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    const fetchAdmins = async () => {
        setLoading(true);
        const q = query(collection(db, "Admins"), orderBy("adminName"));
        const snapshot = await getDocs(q);
        setAdmins(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
    };



    // ==========================================
    // HANDLERS
    // ==========================================
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        
        // Auto-fill Institution Name if ID is selected from a dropdown (Optional Logic)
        if (name === "institutionID") {
            const selected = institutions.find(inst => inst.institutionID === value);
            if (selected) {
                setFormData(prev => ({ ...prev, institutionName: selected.institutionName }));
            }
        }
    };

    const resetForm = () => {
        setFormData({
            adminID: "",
            adminName: "",
            institutionID: "",
            institutionName: "",
            adminType: "",
            role: ""
        });
        setEditingId(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.adminID || !formData.adminName) return alert("Fill required fields");

        setIsSubmitting(true);
        try {
            if (editingId) {
                const adminRef = doc(db, "Admins", editingId);
                await updateDoc(adminRef, { ...formData });
                alert("Admin updated!");
            } else {
                // Check if adminID exists
                const q = query(collection(db, "Admins"), where("adminID", "==", formData.adminID));
                const snap = await getDocs(q);
                if (!snap.empty) throw new Error("Admin ID already exists");

                const newAdminRef = doc(collection(db, "Admins"));
                await setDoc(newAdminRef, { ...formData, createdAt: new Date() });
                alert("Admin created successfully!");
            }
            resetForm();
            fetchAdmins();
        } catch (err) {
            alert(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (admin) => {
        setEditingId(admin.id);
        setFormData({
            adminID: admin.adminID,
            adminName: admin.adminName,
            institutionID: admin.institutionID || "",
            institutionName: admin.institutionName || "",
            adminType: admin.adminType,
            role: admin.role
        });
    };

    const handleDelete = async (id, name) => {
        if (window.prompt(`Pass:`) === ADMIN_PASSWORD) {
            await deleteDoc(doc(db, "Admins", id));
            fetchAdmins();
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8 space-y-10">
            <div className="max-w-4xl mx-auto bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100">
                <header className="text-center mb-8">
                    <h1 className="text-3xl font-black text-slate-800 uppercase">Stage 2: Admin Creation</h1>
                    <p className="text-blue-600 font-bold text-xs tracking-widest uppercase mt-1">Deploying Administrative Authority</p>
                </header>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Unique Admin ID</label>
                        <input
                            name="adminID"
                            value={formData.adminID}
                            onChange={handleInputChange}
                            disabled={!!editingId}
                            className="w-full p-4 bg-slate-50 rounded-2xl border border-transparent focus:ring-2 ring-blue-500 outline-none"
                            placeholder="e.g. ADM-001"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Full Name</label>
                        <input
                            name="adminName"
                            value={formData.adminName}
                            onChange={handleInputChange}
                            className="w-full p-4 bg-slate-50 rounded-2xl border border-transparent focus:ring-2 ring-blue-500 outline-none"
                            placeholder="e.g. Leonard Sankoh Kargbo"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Assign to Institution</label>
                        <select
                            name="institutionID"
                            value={formData.institutionID}
                            onChange={handleInputChange}
                            className="w-full p-4 bg-slate-50 rounded-2xl border border-transparent focus:ring-2 ring-blue-500 outline-none"
                        >
                            <option value="">Select Institution</option>
                            {institutions.map(inst => (
                                <option key={inst.id} value={inst.institutionID}>
                                    {inst.institutionName}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Admin Level</label>
                        <select
                            name="adminType"
                            value={formData.adminType}
                            onChange={handleInputChange}
                            className="w-full p-4 bg-slate-50 rounded-2xl border border-transparent focus:ring-2 ring-blue-500 outline-none"
                        >
                            <option value="">Select Level</option>
                            <option value="Special">Super Admin</option>
                            <option value="Private">Private Admin</option>
                            <option value="Fees">Fees Collector</option>
                        </select>
                    </div>

                    <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Designation / Role</label>
                        <input
                            name="role"
                            value={formData.role}
                            onChange={handleInputChange}
                            className="w-full p-4 bg-slate-50 rounded-2xl border border-transparent focus:ring-2 ring-blue-500 outline-none"
                            placeholder="e.g. Chief Executive Officer"
                        />
                    </div>

                    <div className="md:col-span-2 flex gap-4 mt-4">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-blue-600 transition-all uppercase tracking-widest text-sm shadow-lg active:scale-95 disabled:opacity-50"
                        >
                            {isSubmitting ? "Syncing..." : editingId ? "Update Credentials" : "Authorize Admin"}
                        </button>
                        {editingId && (
                            <button onClick={resetForm} type="button" className="px-8 bg-slate-200 text-slate-600 font-bold rounded-2xl">
                                CANCEL
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* ADMINS LIST */}
            <div className="max-w-5xl mx-auto space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Authorized Personnel ({admins.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {admins.map(admin => (
                        <div key={admin.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all">
                            <div>
                                <h4 className="font-bold text-slate-800">{admin.adminName}</h4>
                                <p className="text-[10px] text-slate-400 font-mono">{admin.institutionName || "Unassigned"}</p>
                                <div className="mt-2 flex gap-2">
                                    <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black uppercase">{admin.adminType}</span>
                                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{admin.role}</span>
                                </div>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(admin)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl">Edit</button>
                                <button onClick={() => handleDelete(admin.id, admin.adminName)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl">Revoke</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminRegistration;