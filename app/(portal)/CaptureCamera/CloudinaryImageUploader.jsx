"use client";

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import imageCompression from 'browser-image-compression';

// Configuration
const CLOUD_NAME = "us1rsa1j";
const UPLOAD_PRESET = "LeotechProject2";
const MAX_FILE_SIZE_MB = 2;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"];


const CloudinaryImageUploader = ({ onUploadSuccess, institutionName }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const validateFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Allowed: JPG, PNG, GIF.");
      return false;
    }
    if (file.size / 1024 / 1024 > MAX_FILE_SIZE_MB) {
      toast.error(`File too large. Max size is ${MAX_FILE_SIZE_MB} MB.`);
      return false;
    }
    return true;
  };

  const compressImage = async (file) => {
    try {
      const options = {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };
      return await imageCompression(file, options);
    } catch (err) {
      console.error("Compression failed:", err);
      return file;
    }
  };

  const uploadFile = async (fileOrBlob) => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", fileOrBlob);
      formData.append("upload_preset", UPLOAD_PRESET);
      
  
      const folderName = `InstituteApp/${institutionName || "Unknown_Institution"}`;
      formData.append("folder", folderName);

      const uploadPromise = new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded * 100) / e.total);
            setProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(JSON.parse(xhr.responseText));
          }
        };

        xhr.onerror = () => reject(new Error("Network Error"));
        xhr.send(formData);
      });

      const data = await uploadPromise;
      
      onUploadSuccess(data.secure_url, data.public_id);
      toast.success("Logo uploaded successfully!");
    } catch (err) {
      console.error("Upload error:", err);
      const msg = err?.error?.message || "Upload failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile || !validateFile(selectedFile)) return;

    const compressed = await compressImage(selectedFile);
    await uploadFile(compressed);
  };

  const handleCameraUpload = async (base64Data) => {
    try {
      const response = await fetch(base64Data);
      const blob = await response.blob();
      const compressed = await compressImage(blob);
      await uploadFile(compressed);
    } catch (err) {
      toast.error("Camera processing failed.");
    }
  };

  return (
    <div className="w-full">
      <div className={`relative border-2 border-dashed rounded-2xl p-4 transition-all ${
        uploading ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-400 bg-slate-50"
      }`}>
        <label className="flex flex-col items-center justify-center cursor-pointer min-h-[80px]">
          <div className="flex flex-col items-center justify-center">
            {uploading ? (
              <div className="space-y-2 text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-tighter">Uploading {progress}%</p>
              </div>
            ) : (
              <>
                <svg className="w-6 h-6 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <p className="text-xs font-bold text-slate-500 uppercase">Change Institution Logo</p>
              </>
            )}
          </div>
          
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="text-red-500 text-[10px] font-bold uppercase mt-2 text-center">{error}</p>}
    </div>
  );
};

export default CloudinaryImageUploader;