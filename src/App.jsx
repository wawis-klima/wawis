import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import AuthScreen from "./components/AuthScreen";
import JobDetailsPanel from "./components/JobDetailsPanel";
import JobsPanel from "./components/JobsPanel";
import ConfirmDeleteModal from "./components/modals/ConfirmDeleteModal";
import JobFormModal from "./components/modals/JobFormModal";
import PreviewModal from "./components/modals/PreviewModal";
import { isOlderThan30Days, normalizeStatus, STATUSES } from "./utils/jobHelpers.jsx";

const env = typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};
const supabaseUrl = env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const LOGOUT_FLAG_KEY = "klima-force-logout";

function StatusInboxIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 13.5V7.8C4 6.81 4.81 6 5.8 6h12.4c.99 0 1.8.81 1.8 1.8v5.7" />
      <path d="M4 13.5h4.2l1.6 2h4.4l1.6-2H20" />
      <path d="M4 13.5V16.2C4 17.19 4.81 18 5.8 18h12.4c.99 0 1.8-.81 1.8-1.8v-2.7" />
    </svg>
  );
}

function StatusWrenchIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14.6 6.2a4.3 4.3 0 0 0 3.2 5.2l-6.9 6.9a2.1 2.1 0 1 1-3-3l6.9-6.9a4.3 4.3 0 0 0 5.2-3.2l-2.6 2.6-2.8-.6-.6-2.8 2.6-2.2Z" />
    </svg>
  );
}

function StatusXIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 8l8 8" />
      <path d="M16 8l-8 8" />
    </svg>
  );
}


function StatusBlob({ variant, className = "" }) {
  const pathMap = {
    blue: "M12.3 62.9C5.8 49.1 6.7 22.9 26 16.6c10.7-3.5 16.4 2.4 25.8 1.4 10-1.1 19.1-11.4 29.6-7.3 10.3 4 9.6 17.4 8.1 27.8-1.7 11.6 1.7 24.8-7 32.6-8.8 7.9-22.4 4.2-34.2 5.7-14.2 1.8-29.8-.6-35.9-13.9Z",
    amber: "M18.2 67.4C8 55.2 8.5 31.3 24.1 20.7c11.2-7.5 24.5-.5 38.1-2.8 10.2-1.7 21.4-8.8 28.2-.9 6.5 7.5.8 19.1-.5 29.1-1.2 9.6 5 22.3-2.6 28.3-7.4 5.8-18.7 1-28 2.5-14.7 2.4-31.7 1.7-41.1-9.5Z",
    slate: "M14.8 60.6C8.1 46.9 11.4 24.1 28.7 18.7c11.4-3.5 19.7 4.8 31 4.7 10.2-.1 20.6-7.1 27.4.5 6.6 7.4 4.7 19.2 1.2 29.2-3 8.7-5.6 18.3-13.7 23.4-8.5 5.4-18.9 2-28.8 1.7-12.8-.4-25.4-5.3-31-16.3Z",
    green: "M13.7 60.4C8.5 46.4 10.8 24 27.1 17.6c11.4-4.5 19.8 3.7 31.5 2.8 11-.9 22.7-10.7 30.3-2.7 7.2 7.7 1.1 20.5-.6 31.1-1.4 8.7 2.9 19.6-3.5 25.7-6.4 6.1-16.6 3.7-25 5.2-17.1 3.1-39 2.3-46.1-19.3Z",
  };
  return (
    <svg viewBox="0 0 100 86" className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d={pathMap[variant] || pathMap.blue} fill="currentColor" />
    </svg>
  );
}

function StatusCheckIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m7.5 12.5 3.2 3.2 5.8-7" />
    </svg>
  );
}


export default function App() {
  const [sessionUser, setSessionUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const selectedJobIdRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [showStats, setShowStats] = useState(false);
  const [desktopStatusFilter, setDesktopStatusFilter] = useState("Nowe");
  const [showAssignedJobsOnly, setShowAssignedJobsOnly] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth <= 700 : false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [jobToDelete, setJobToDelete] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ fullName: "", email: "", password: "", role: "Pracownik" });
  const emptyJobForm = { title: "", client: "", email: "", phone: "", city: "", street: "", location: "", status: "Nowe", admin_note: "", main_technician_id: "", viewers: [] };
  const [jobForm, setJobFormState] = useState(emptyJobForm);
  const jobFormRef = useRef(emptyJobForm);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);

  const isConfigured = Boolean(supabase);
  const isAdmin = profile?.role === "Administrator";
  const desktopStatusLabels = {
    "Nowe": "Nowe",
    "W trakcie": "W trakcie",
    "Niezrealizowane": "Niezrealizowane",
    "Zakończone": "Zakończone",
  };
  const statusButtonConfig = {
    "Nowe": { buttonClass: "statusButtonBlue", imageSrc: "/status-buttons/status-blue.png" },
    "W trakcie": { buttonClass: "statusButtonAmber", imageSrc: "/status-buttons/status-amber.png" },
    "Niezrealizowane": { buttonClass: "statusButtonSlate", imageSrc: "/status-buttons/status-slate.png" },
    "Zakończone": { buttonClass: "statusButtonGreen", imageSrc: "/status-buttons/status-green.png" },
  };

  function getPublicPhotoUrl(storagePath, fallbackUrl = '') {
    if (storagePath && supabase) {
      const { data } = supabase.storage.from('job-photos').getPublicUrl(storagePath);
      if (data?.publicUrl) return data.publicUrl;
    }
    return fallbackUrl || '';
  }

  function getPhotoStoragePath(photo) {
    if (photo?.storage_path) return photo.storage_path;
    const imageUrl = String(photo?.image_url || '').trim();
    if (!imageUrl || !supabaseUrl) return '';
    const marker = `${supabaseUrl}/storage/v1/object/public/job-photos/`;
    if (!imageUrl.startsWith(marker)) return '';
    try {
      return decodeURIComponent(imageUrl.slice(marker.length).split('?')[0]);
    } catch {
      return imageUrl.slice(marker.length).split('?')[0];
    }
  }

  function setJobForm(nextValue) {
    setJobFormState((prev) => {
      const resolved = typeof nextValue === "function" ? nextValue(prev) : nextValue;
      jobFormRef.current = resolved;
      return resolved;
    });
  }

  function formatDate(dateStr){
    if(!dateStr) return "";
    const d = new Date(dateStr);

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = String(d.getFullYear()).slice(-2);

    return `${day}.${month}.${year}`;
  }

  function toggleSort(field) {
    setSortBy((prev) => {
      if (prev === `${field}_asc`) return `${field}_desc`;
      if (prev === `${field}_desc`) return `${field}_asc`;
      return `${field}_asc`;
    });
  }

  function getSortLabel(field, label) {
    if (sortBy === `${field}_asc`) return `${label} ↑`;
    if (sortBy === `${field}_desc`) return `${label} ↓`;
    return label;
  }


  function openPreview(photoUrl, index) {
    setPreviewImage(photoUrl);
    setPreviewIndex(index);
  }

  function previewPrev() {
    if (!selectedJob || !selectedJob.photos?.length) return;
    const nextIndex = (previewIndex - 1 + selectedJob.photos.length) % selectedJob.photos.length;
    setPreviewIndex(nextIndex);
    setPreviewImage(selectedJob.photos[nextIndex].image_url);
  }

  function previewNext() {
    if (!selectedJob || !selectedJob.photos?.length) return;
    const nextIndex = (previewIndex + 1) % selectedJob.photos.length;
    setPreviewIndex(nextIndex);
    setPreviewImage(selectedJob.photos[nextIndex].image_url);
  }

  async function deletePhoto(photo) {
    if (!supabase || !photo || deletingPhotoId) return;
    const confirmed = window.confirm("Usunąć to zdjęcie?");
    if (!confirmed) return;

    const storagePath = getPhotoStoragePath(photo);
    const photoUrl = getPublicPhotoUrl(storagePath, photo.image_url);
    const rollbackJobs = jobs;
    const rollbackSelectedJob = selectedJob;

    setDeletingPhotoId(photo.id);

    if (previewImage === photo.image_url || previewImage === photoUrl) {
      setPreviewImage(null);
    }

    setJobs((prev) => prev.map((job) =>
      job.id === photo.job_id
        ? { ...job, photos: (job.photos || []).filter((item) => item.id !== photo.id) }
        : job
    ));
    setSelectedJob((prev) => prev && prev.id === photo.job_id
      ? { ...prev, photos: (prev.photos || []).filter((item) => item.id !== photo.id) }
      : prev
    );

    try {
      const { error: deleteDbError } = await supabase
        .from("photos")
        .delete()
        .eq("id", photo.id)
        .eq("job_id", photo.job_id);

      if (deleteDbError) throw deleteDbError;

      if (storagePath) {
        const { error: storageError } = await supabase.storage.from("job-photos").remove([storagePath]);
        if (storageError && !/not\s*found/i.test(storageError.message || "")) {
          console.warn("Nie udało się usunąć pliku ze storage:", storageError.message);
        }
      }

      await refreshAll(sessionUser, true);
    } catch (e) {
      setJobs(rollbackJobs);
      setSelectedJob(rollbackSelectedJob);
      const rawMessage = e?.message || "Nie udało się usunąć zdjęcia.";
      const details = String(rawMessage).toLowerCase();
      if (details.includes("row-level security") || details.includes("permission") || details.includes("policy")) {
        alert("Supabase blokuje usunięcie zdjęcia. Trzeba odblokować DELETE dla tabeli photos albo storage job-photos.");
      } else {
        alert(rawMessage);
      }
    } finally {
      setDeletingPhotoId(null);
    }
  }


  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxWidth = 1600;
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Nie udało się skompresować zdjęcia."));
                return;
              }
              const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
                type: "image/jpeg",
              });
              resolve(compressed);
            },
            "image/jpeg",
            0.75
          );
        };
        img.onerror = () => reject(new Error("Nie udało się odczytać zdjęcia."));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Nie udało się otworzyć pliku."));
      reader.readAsDataURL(file);
    });
  }


  async function refreshAll(user, options = {}) {
    if (!supabase || !user) return;
    const { silent = false } = options;
    if (!silent) {
      setBusy(true);
      setErrorMsg("");
    }
    try {
      let { data: me, error: meError } = await supabase.from("profiles").select("id, full_name, email, role").eq("id", user.id).maybeSingle();
      if (meError) throw meError;

      if (!me) {
        const fallback = {
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email || "Użytkownik",
          email: user.email,
          role: user.user_metadata?.role || "Pracownik",
        };
        const { error } = await supabase.from("profiles").upsert(fallback);
        if (error) throw error;
        me = fallback;
      }

      const { data: team, error: teamError } = await supabase.from("profiles").select("id, full_name, email, role").order("full_name", { ascending: true });
      if (teamError) throw teamError;

      let { data: jobsData, error: jobsError } = await supabase.from("jobs").select("id, title, client, email, phone, city, street, location, status, admin_note, created_at, created_by, main_technician_id").order("created_at", { ascending: false });
      if (jobsError) throw jobsError;

      const staleNewJobs = (jobsData || []).filter((job) => normalizeStatus(job.status) === "Nowe" && isOlderThan30Days(job.created_at));
      if (staleNewJobs.length) {
        const { error: staleJobsError } = await supabase
          .from("jobs")
          .update({ status: "Niezrealizowane" })
          .in("id", staleNewJobs.map((job) => job.id));
        if (staleJobsError) throw staleJobsError;

        const refreshedJobsResponse = await supabase
          .from("jobs")
          .select("id, title, client, email, phone, city, street, location, status, admin_note, created_at, created_by, main_technician_id")
          .order("created_at", { ascending: false });
        jobsData = refreshedJobsResponse.data;
        jobsError = refreshedJobsResponse.error;
        if (jobsError) throw jobsError;
      }

      const { data: accessData, error: accessError } = await supabase.from("job_access").select("id, job_id, user_id");
      if (accessError) throw accessError;

      const { data: commentsData, error: commentsError } = await supabase.from("comments").select("id, job_id, author_id, type, text, created_at").order("created_at", { ascending: true });
      if (commentsError) throw commentsError;

      const { data: photosData, error: photosError } = await supabase.from("photos").select("id, job_id, image_url, storage_path, uploaded_by, created_at").order("created_at", { ascending: true });
      if (photosError) throw photosError;

      const { data: notificationsData, error: notificationsError } = await supabase
        .from("notifications")
        .select("id, user_id, title, body, is_read, created_at, link_job_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (notificationsError) throw notificationsError;

      const names = new Map((team || []).map((p) => [p.id, p.full_name || p.email || "Użytkownik"]));

      const combined = (jobsData || []).map((job) => ({
        ...job,
        viewers: (accessData || []).filter((x) => x.job_id === job.id),
        comments: (commentsData || []).filter((x) => x.job_id === job.id).map((x) => ({ ...x, author_name: names.get(x.author_id) || "Użytkownik" })),
        photos: (photosData || [])
          .filter((x) => x.job_id === job.id)
          .map((x) => ({ ...x, image_url: getPublicPhotoUrl(x.storage_path, x.image_url), uploader_name: names.get(x.uploaded_by) || "Pracownik" })),
      }));

      setSessionUser(user);
      setProfile(me);
      setProfiles(team || []);
      setJobs(combined);
      setNotifications(notificationsData || []);

      if (selectedJobIdRef.current) {
        const refreshed = combined.find((x) => x.id === selectedJobIdRef.current);
        setSelectedJob(refreshed || null);
      }
    } catch (e) {
      setErrorMsg(e.message || "Nie udało się pobrać danych.");
    } finally {
      if (!silent) {
        setBusy(false);
      }
    }
  }

  async function login(credentials = {}) {
    if (!supabase) return;
    const email = String(credentials.email ?? loginForm.email ?? "").trim();
    const password = String(credentials.password ?? loginForm.password ?? "");

    if (!email || !password) {
      setErrorMsg("Podaj email i hasło.");
      return;
    }

    setBusy(true);
    setErrorMsg("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      setLoginForm({ email, password: "" });
      setSessionUser(data.user || null);
      setAuthResolved(true);

      // Nie blokuj sukcesu logowania błędem późniejszego odświeżenia danych.
      // Sesja jest już utworzona, a profile/jobs dociągnie listener auth lub fallback poniżej.
      try {
        await refreshAll(data.user);
      } catch (refreshError) {
        setErrorMsg(refreshError?.message || "Zalogowano, ale nie udało się odświeżyć danych.");
      }
    } catch (e) {
      setLoginForm((prev) => ({ ...prev, email, password: prev.password || password }));
      setErrorMsg(e.message || "Błąd logowania.");
    } finally {
      setBusy(false);
    }
  }

  async function registerUser() {
    if (!supabase) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const { error } = await supabase.auth.signUp({
        email: registerForm.email.trim(),
        password: registerForm.password,
        options: { data: { full_name: registerForm.fullName, role: registerForm.role } },
      });
      if (error) throw error;
      alert("Konto utworzone. Możesz się zalogować.");
    } catch (e) {
      setErrorMsg(e.message || "Błąd rejestracji.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const clearLocalState = () => {
      setSessionUser(null);
      setProfile(null);
      setProfiles([]);
      setJobs([]);
      setSelectedJob(null);
      setNotifications([]);
      setShowAssignedJobsOnly(false);
      setAuthResolved(true);
    };

    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(LOGOUT_FLAG_KEY, "1");
        const authKeys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key && key.toLowerCase().includes("supabase")) authKeys.push(key);
        }
        authKeys.forEach((key) => localStorage.removeItem(key));
      }

      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
      }
    } catch (e) {
      alert(e.message || "Nie udało się wylogować.");
    } finally {
      clearLocalState();
      if (typeof window !== "undefined") {
        window.location.replace(window.location.pathname);
      }
    }
  }

  async function createNotification(user_id, title, body, link_job_id = null) {
    if (!supabase) return;
    await supabase.from("notifications").insert({ user_id, title, body, link_job_id, is_read: false });
  }

  async function markNotificationRead(id) {
    if (!supabase) return;
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    await refreshAll(sessionUser);
  }





  async function addJob(formOverride) {
    if (!supabase || !profile) return;
    const form = formOverride || jobFormRef.current;
    if (!form.client.trim()) return alert("Podaj klienta.");
    if (!form.city.trim()) return alert("Podaj miejscowość.");
    if (!form.street.trim()) return alert("Podaj ulicę.");

    setBusy(true);
    try {
      const { data, error } = await supabase.from("jobs").insert({
        title: form.client.trim(),
        client: form.client.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        street: form.street.trim(),
        location: `${form.city.trim()}, ${form.street.trim()}`,
        status: normalizeStatus(form.status),
        admin_note: form.admin_note.trim(),
        created_by: profile.id,
        main_technician_id: form.main_technician_id || null,
      }).select("id").single();
      if (error) throw error;

      const selectedUsers = [...new Set(form.viewers)];
      if (selectedUsers.length) {
        const { error: accessError } = await supabase.from("job_access").insert(
          selectedUsers.map((userId) => ({ job_id: data.id, user_id: userId }))
        );
        if (accessError) throw accessError;

        for (const userId of selectedUsers) {
          if (userId !== profile.id) {
            await createNotification(
              userId,
              "Nowe",
              `Dodano nowe zlecenie: ${form.client.trim()}`,
              data.id
            );
          }
        }
      }


      setJobForm(emptyJobForm);
      setShowModal(false);
      await refreshAll(sessionUser);
    } catch (e) {
      alert(e.message || "Błąd zapisu.");
    } finally {
      setBusy(false);
    }
  }

  function openEditJob(job) {
    if (!job) return;
    setEditingJobId(job.id);
    setJobForm({
      title: job.client || job.title || "",
      client: job.client || "",
      email: job.email || "",
      phone: job.phone || "",
      city: job.city || (job.location?.split(",")[0]?.trim() || ""),
      street: job.street || (job.location?.split(",").slice(1).join(",").trim() || ""),
      location: job.location || "",
      status: normalizeStatus(job.status),
      admin_note: job.admin_note || "",
      main_technician_id: job.main_technician_id || "",
      viewers: profiles.filter((p) => job.viewers.some((v) => v.user_id === p.id) && p.id !== job.main_technician_id).map((p) => p.id),
    });
    setShowModal(true);
  }

  async function saveEditedJob(formOverride) {
    if (!supabase || !editingJobId) return;
    const form = formOverride || jobFormRef.current;
    if (!form.client.trim()) return alert("Podaj klienta.");
    if (!form.city.trim()) return alert("Podaj miejscowość.");
    if (!form.street.trim()) return alert("Podaj ulicę.");

    setBusy(true);
    try {
      const existingJob = jobs.find((job) => job.id === editingJobId) || null;

      const { error } = await supabase.from("jobs").update({
        title: form.client.trim(),
        client: form.client.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        street: form.street.trim(),
        location: `${form.city.trim()}, ${form.street.trim()}`,
        status: normalizeStatus(form.status),
        admin_note: form.admin_note.trim(),
        main_technician_id: form.main_technician_id || null,
      }).eq("id", editingJobId);

      if (error) throw error;

      const { error: deleteAccessError } = await supabase.from("job_access").delete().eq("job_id", editingJobId);
      if (deleteAccessError) throw deleteAccessError;

      const selectedUsers = [...new Set(form.viewers)];
      if (selectedUsers.length) {
        const { error: insertAccessError } = await supabase.from("job_access").insert(
          selectedUsers.map((userId) => ({ job_id: editingJobId, user_id: userId }))
        );
        if (insertAccessError) throw insertAccessError;
      }


      setShowModal(false);
      setEditingJobId(null);
      void refreshAll(sessionUser, { silent: true });
    } catch (e) {
      alert(e.message || "Nie udało się zapisać zmian.");
    } finally {
      setBusy(false);
    }
  }

  function deleteJob(job) {
    if (!job) return;
    setJobToDelete(job);
  }

  async function confirmDeleteJob() {
    if (!supabase || !jobToDelete) return;

    setBusy(true);
    try {
      const photoPaths = (jobToDelete.photos || []).map((p) => p.storage_path).filter(Boolean);
      if (photoPaths.length) {
        await supabase.storage.from("job-photos").remove(photoPaths);
      }

      const { data, error } = await supabase.from("jobs").delete().eq("id", jobToDelete.id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Brak uprawnień do usunięcia karty albo karta nie została usunięta.");
      }

      if (selectedJob?.id === jobToDelete.id) {
        setSelectedJob(null);
      }

      setJobToDelete(null);
      await refreshAll(sessionUser);
    } catch (e) {
      alert(e.message || "Nie udało się usunąć karty montażu.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(jobId, status) {
    if (!supabase) return;
    const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
    if (error) return alert(error.message);
    await refreshAll(sessionUser);
  }

  async function saveAdminNote(jobId, admin_note) {
    if (!supabase) return;
    const { error } = await supabase.from("jobs").update({ admin_note }).eq("id", jobId);
    if (error) return alert(error.message);
    await refreshAll(sessionUser);
  }

  async function addComment(jobId, type) {
    if (!supabase || !profile) return;
    const text = (commentDrafts[jobId] || "").trim();
    if (!text) return;
    const { error } = await supabase.from("comments").insert({ job_id: jobId, author_id: profile.id, type, text });
    if (error) return alert(error.message);

    const relatedJob = jobs.find((j) => j.id === jobId);
    const targets = new Set();

    if (relatedJob) {
      relatedJob.viewers.forEach((viewer) => {
        if (viewer.user_id !== profile.id) targets.add(viewer.user_id);
      });
    }

    profiles.forEach((p) => {
      if (p.role === "Administrator" && p.id !== profile.id) targets.add(p.id);
    });

    for (const userId of targets) {
      await createNotification(
        userId,
        "Nowy komentarz",
        `${profile.full_name} dodał komentarz do zlecenia: ${relatedJob?.title || "Montaż"}`,
        jobId
      );
    }

    setCommentDrafts((prev) => ({ ...prev, [jobId]: "" }));
    await refreshAll(sessionUser);
  }

  async function toggleViewer(jobId, userId, viewers) {
    if (!supabase) return;
    const exists = viewers.some((v) => v.user_id === userId);
    if (exists) {
      const { error } = await supabase.from("job_access").delete().eq("job_id", jobId).eq("user_id", userId);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from("job_access").insert({ job_id: jobId, user_id: userId });
      if (error) return alert(error.message);

    }
    await refreshAll(sessionUser);
  }

  async function handlePhotoUpload(jobId, e) {
    if (!supabase || !profile) return;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      try {
        const compressedFile = await compressImage(file);
        const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, compressedFile, { cacheControl: "3600", upsert: false });
        if (uploadError) { alert(uploadError.message); continue; }
        const { data } = supabase.storage.from("job-photos").getPublicUrl(path);
        const { error: photoError } = await supabase.from("photos").insert({ job_id: jobId, image_url: data.publicUrl, storage_path: path, uploaded_by: profile.id });
        if (photoError) alert(photoError.message);
      } catch (err) {
        alert(err.message || "Błąd kompresji zdjęcia.");
      }
    }
    e.target.value = "";
    await refreshAll(sessionUser);
  }

  useEffect(() => {
    if (!supabase) return undefined;

    let isMounted = true;

    const restoreSession = async () => {
      if (typeof window !== "undefined" && sessionStorage.getItem(LOGOUT_FLAG_KEY) === "1") {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
        setSessionUser(null);
        setProfile(null);
        setProfiles([]);
        setJobs([]);
        setSelectedJob(null);
        setNotifications([]);
        setShowAssignedJobsOnly(false);
        setShowAssignedJobsOnly(false);
        setAuthResolved(true);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (isMounted) {
          setErrorMsg(error.message || "Nie udało się przywrócić sesji.");
          setAuthResolved(true);
        }
        return;
      }

      const user = data.session?.user || null;
      if (!isMounted) return;

      if (user) {
        await refreshAll(user);
      } else {
        setSessionUser(null);
        setProfile(null);
        setProfiles([]);
        setJobs([]);
        setSelectedJob(null);
        setNotifications([]);
        setShowAssignedJobsOnly(false);
      }

      if (isMounted) setAuthResolved(true);
    };

    restoreSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (typeof window !== "undefined" && sessionStorage.getItem(LOGOUT_FLAG_KEY) === "1") {
        setAuthResolved(true);
        return;
      }

      setAuthResolved(true);
      const user = session?.user || null;
      if (user) {
        refreshAll(user);
      } else {
        setSessionUser(null);
        setProfile(null);
        setProfiles([]);
        setJobs([]);
        setSelectedJob(null);
        setNotifications([]);
        setShowAssignedJobsOnly(false);
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    selectedJobIdRef.current = selectedJob?.id || null;
  }, [selectedJob]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const media = window.matchMedia("(max-width: 700px)");
    const updateMobileState = (event) => setIsMobile(event.matches);

    setIsMobile(media.matches);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateMobileState);
      return () => media.removeEventListener("change", updateMobileState);
    }

    media.addListener(updateMobileState);
    return () => media.removeListener(updateMobileState);
  }, []);

  useEffect(() => {
    if (!supabase || !sessionUser) return;

    const refreshNow = () => refreshAll(sessionUser, { silent: true });

    const channel = supabase
      .channel(`live-refresh-${sessionUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, refreshNow)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_access" }, refreshNow)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, refreshNow)
      .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, refreshNow)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refreshNow)
      .subscribe(() => {
        refreshNow();
      });

    let isCancelled = false;
    let refreshTimer = null;

    const scheduleRefresh = () => {
      refreshTimer = window.setTimeout(async () => {
        if (isCancelled) return;
        await refreshNow();
        if (!isCancelled) scheduleRefresh();
      }, 2000);
    };

    scheduleRefresh();

    const handleWindowFocus = () => {
      refreshNow();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshNow();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [sessionUser]);

  const visibleJobs = useMemo(() => {
    if (!profile) return [];
    const normalizedQuery = query.trim().toLowerCase();
    const hasActiveQuery = normalizedQuery.length > 0;

    const filtered = jobs.filter((job) => {
      const hay = `${job.client || ""} ${job.city || ""} ${job.street || ""} ${job.email || ""}`.toLowerCase();
      const matchesQuery = hay.includes(normalizedQuery);
      const isAssignedToCurrentUser = job.main_technician_id === profile.id || job.viewers.some((viewer) => viewer.user_id === profile.id);
      const shouldIgnoreStatusFilter = !isAdmin && showAssignedJobsOnly;
      const matchesStatus = hasActiveQuery || shouldIgnoreStatusFilter ? true : normalizeStatus(job.status) === desktopStatusFilter;
      const matchesAssignedFilter = isAdmin || !showAssignedJobsOnly ? true : isAssignedToCurrentUser;
      return matchesQuery && matchesStatus && matchesAssignedFilter;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "client_asc") return (a.client || a.title || "").localeCompare(b.client || b.title || "", "pl");
      if (sortBy === "client_desc") return (b.client || b.title || "").localeCompare(a.client || a.title || "", "pl");
      if (sortBy === "date_desc") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === "date_asc") return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      if (sortBy === "city_asc") return (a.city || "").localeCompare(b.city || "", "pl");
      if (sortBy === "city_desc") return (b.city || "").localeCompare(a.city || "", "pl");
      if (sortBy === "street_asc") return (a.street || "").localeCompare(b.street || "", "pl");
      if (sortBy === "street_desc") return (b.street || "").localeCompare(a.street || "", "pl");
      return 0;
    });
  }, [desktopStatusFilter, isAdmin, isMobile, jobs, profile, query, showAssignedJobsOnly, sortBy]);

  useEffect(() => {
    if (selectedJob && !visibleJobs.some((job) => job.id === selectedJob.id)) {
      setSelectedJob(null);
    }
  }, [selectedJob, visibleJobs]);


  if (!isConfigured) {
    return <div className="page"><div className="card authCard">Brakuje pliku .env.local z Supabase.</div></div>;
  }

  if (!authResolved) {
    return <div className="page"><div className="card authCard">Trwa przywracanie sesji...</div></div>;
  }

  if (!sessionUser || !profile) {
    return (
      <AuthScreen
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        registerForm={registerForm}
        setRegisterForm={setRegisterForm}
        login={login}
        registerUser={registerUser}
        busy={busy}
        showRegisterModal={showRegisterModal}
        setShowRegisterModal={setShowRegisterModal}
        errorMsg={errorMsg}
      />
    );
  }

  return (
    <div className="page pageDesktopStatusLeft">
      {isMobile ? (
        <div className="summary premiumSummary">
          <div>
            <div className="summaryHeader">
              <h1>Podsumowanie montaży</h1>
            </div>
            <p>{!isAdmin && showAssignedJobsOnly ? `Na dole masz jedną tabelę wszystkich Twoich przypisanych zleceń. Kliknięcie w Twoje imię i nazwisko wraca do pełnej listy.` : `Na dole masz tabelę dla sekcji: ${desktopStatusLabels[desktopStatusFilter]}. Kliknięcie w kafelek zmienia widok tabeli.`}</p>
          </div>
        </div>
      ) : null}

      {errorMsg ? <div className="errorBox">{errorMsg}</div> : null}

      <div className="twoCol twoColDesktopStatusLeft">
        <div>
          <JobsPanel
          desktopStatusLabels={desktopStatusLabels}
          desktopStatusFilter={desktopStatusFilter}
          statuses={STATUSES}
          jobs={jobs}
          normalizeStatusFn={normalizeStatus}
          statusButtonConfig={statusButtonConfig}
          setDesktopStatusFilter={setDesktopStatusFilter}
          isAdmin={isAdmin}
          setShowModal={setShowModal}
          refreshAll={refreshAll}
          sessionUser={sessionUser}
          logout={logout}
          query={query}
          setQuery={setQuery}
          profile={profile}
          showAssignedJobsOnly={showAssignedJobsOnly}
          toggleAssignedJobsOnly={() => setShowAssignedJobsOnly((prev) => !prev)}
          isMobile={isMobile}
          visibleJobs={visibleJobs}
          selectedJob={selectedJob}
          setSelectedJob={setSelectedJob}
          formatDate={formatDate}
          toggleSort={toggleSort}
          getSortLabel={getSortLabel}
          profiles={profiles}
        />
        </div>

        <div className="desktopDetailColumnTight">
          <JobDetailsPanel
          selectedJob={selectedJob}
          isAdmin={isAdmin}
          busy={busy}
          profiles={profiles}
          formatDate={formatDate}
          openEditJob={openEditJob}
          deleteJob={deleteJob}
          setSelectedJob={setSelectedJob}
          setSelectedJobByUpdater={setSelectedJob}
          setJobs={setJobs}
          saveAdminNote={saveAdminNote}
          openPreview={openPreview}
          deletePhoto={deletePhoto}
          deletingPhotoId={deletingPhotoId}
          handlePhotoUpload={handlePhotoUpload}
          toggleViewer={toggleViewer}
          commentDrafts={commentDrafts}
          setCommentDrafts={setCommentDrafts}
          addComment={addComment}
          updateStatus={updateStatus}
        />
        </div>
      </div>

      <PreviewModal previewImage={previewImage} setPreviewImage={setPreviewImage} previewNext={previewNext} previewPrev={previewPrev} />
      <ConfirmDeleteModal jobToDelete={jobToDelete} setJobToDelete={setJobToDelete} confirmDeleteJob={confirmDeleteJob} busy={busy} />
      <JobFormModal
        showModal={showModal}
        setShowModal={setShowModal}
        editingJobId={editingJobId}
        setEditingJobId={setEditingJobId}
        jobForm={jobForm}
        setJobForm={setJobForm}
        profiles={profiles}
        addJob={addJob}
        saveEditedJob={saveEditedJob}
        busy={busy}
      />
    </div>
  );
}
