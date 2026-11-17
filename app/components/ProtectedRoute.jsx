"use client";
//app/component/protectRpute.jsx
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // ❌ Not logged in
      if (!user) {
        router.replace("/");
        return;
      }

      // ❌ Wrong role
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        router.replace("/");
      }
    }
  }, [user, loading, router, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Checking access...
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;