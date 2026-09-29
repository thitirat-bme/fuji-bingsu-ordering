"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// created_at จาก Supabase เป็น timestamptz อยู่แล้ว แต่กันไว้ กรณีไม่มี timezone ให้ถือเป็น UTC
function parseDate(value) {
  if (!value) return new Date(NaN);
  const s = String(value);
  return /([zZ]|[+-]\d{2}(:?\d{2})?)$/.test(s) ? new Date(s) : new Date(s.replace(" ", "T") + "Z");
}

function minutesSince(value, now) {
  const diff = Math.floor((now - parseDate(value).getTime()) / 60000);
  return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}

export default function GenerateQrPage() {
  const [tableNumber, setTableNumber] = useState("");
  const [adults, setAdults] = useState("");
  const [children, setChildren] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [conflict, setConflict] = useState(null); // session เก่าที่ยังเปิดค้างอยู่
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [nowAtOpen, setNowAtOpen] = useState(Date.now());

  const [result, setResult] = useState(null); // { table, adults, children, url }
  const [copied, setCopied] = useState(false);

  // กด Esc = ยกเลิกกล่องยืนยัน
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !closing) setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, closing]);

  function onTableChange(value) {
    setTableNumber(value);
    // เปลี่ยนเลขโต๊ะแล้ว คำเตือนของโต๊ะเดิมไม่เกี่ยวข้องอีกต่อไป
    setConflict(null);
    setNotice("");
    setError("");
  }

  async function handleOpenTable(e) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setNotice("");

    const table = Number(tableNumber);
    const adultCount = Number(adults === "" ? 0 : adults);
    const childCount = Number(children === "" ? 0 : children);

    if (!Number.isInteger(table) || table < 1) {
      setError("กรุณากรอกเลขโต๊ะเป็นตัวเลขตั้งแต่ 1 ขึ้นไป");
      return;
    }
    if (!Number.isInteger(adultCount) || adultCount < 0 || !Number.isInteger(childCount) || childCount < 0) {
      setError("จำนวนผู้ใหญ่และเด็กต้องเป็นจำนวนเต็ม ไม่ติดลบ");
      return;
    }
    if (adultCount + childCount < 1) {
      setError("กรุณาระบุจำนวนลูกค้าอย่างน้อย 1 คน");
      return;
    }

    setLoading(true);
    try {
      // 1) เช็คว่าโต๊ะนี้มี session ที่ยังเปิดอยู่หรือไม่
      const { data: existing, error: checkError } = await supabase
        .from("sessions")
        .select("id, adult_count, child_count, created_at")
        .eq("table_number", table)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1);

      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        setConflict({ ...existing[0], table_number: table });
        return;
      }

      // 2) ไม่มี → สร้าง session ใหม่
      const { error: insertError } = await supabase.from("sessions").insert({
        table_number: table,
        adult_count: adultCount,
        child_count: childCount,
        status: "open",
      });

      if (insertError) throw insertError;

      setResult({
        table,
        adults: adultCount,
        children: childCount,
        url: `${window.location.origin}/order/${table}`,
      });
      setCopied(false);
    } catch (err) {
      setError("เกิดข้อผิดพลาด: " + (err?.message || "ไม่ทราบสาเหตุ") + " — กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  function askCloseOld() {
    setNowAtOpen(Date.now());
    setConfirmOpen(true);
  }

  async function confirmCloseOld() {
    if (!conflict || closing) return;
    setClosing(true);
    setError("");
    try {
      // เช็ค status = 'open' ซ้ำตอน update กันการกดซ้ำซ้อน
      const { data, error: updateError } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", conflict.id)
        .eq("status", "open")
        .select("id");

      if (updateError) throw updateError;

      const alreadyClosed = !data || data.length === 0;
      setConfirmOpen(false);
      setConflict(null);
      setNotice(
        alreadyClosed
          ? "โต๊ะนี้ถูกปิดไปแล้ว กด “เปิดโต๊ะ” เพื่อเปิดใหม่"
          : "ปิดโต๊ะเดิมเรียบร้อย กด “เปิดโต๊ะ” อีกครั้งเพื่อเปิดใหม่"
      );
    } catch (err) {
      setConfirmOpen(false);
      setError("ปิดโต๊ะเดิมไม่สำเร็จ: " + (err?.message || "ไม่ทราบสาเหตุ") + " — กรุณาลองใหม่อีกครั้ง");
    } finally {
      setClosing(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
    } catch {
      // fallback สำหรับเบราว์เซอร์ที่ไม่รองรับ clipboard API
      const ta = document.createElement("textarea");
      ta.value = result.url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetForm() {
    setResult(null);
    setTableNumber("");
    setAdults("");
    setChildren("");
    setConflict(null);
    setNotice("");
    setError("");
    setCopied(false);
  }

  const qrSrc = result
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.url)}`
    : "";

  return (
    <main className="gq">
      <style>{css}</style>

      <h1 className="gq-title">เปิดโต๊ะ</h1>

      {result ? (
        <section className="gq-card gq-result" aria-live="polite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="gq-qr"
            src={qrSrc}
            width={300}
            height={300}
            alt={`QR Code สำหรับสั่งอาหารโต๊ะ ${result.table}`}
          />
          <p className="gq-summary">
            โต๊ะ {result.table} · ผู้ใหญ่ {result.adults} · เด็ก {result.children}
          </p>
          <div className="gq-linkrow">
            <span className="gq-link">{result.url}</span>
            <button type="button" className="gq-btn gq-btn-small" onClick={copyLink}>
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
          </div>
          <button type="button" className="gq-btn gq-btn-primary" onClick={resetForm}>
            เปิดโต๊ะใหม่
          </button>
        </section>
      ) : (
        <form className="gq-card" onSubmit={handleOpenTable} noValidate>
          <label className="gq-field">
            <span>เลขโต๊ะ</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={tableNumber}
              onChange={(e) => onTableChange(e.target.value)}
              placeholder="เช่น 7"
              autoFocus
            />
          </label>

          <label className="gq-field">
            <span>จำนวนผู้ใหญ่</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
              placeholder="0"
            />
          </label>

          <label className="gq-field">
            <span>จำนวนเด็ก</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={children}
              onChange={(e) => setChildren(e.target.value)}
              placeholder="0"
            />
          </label>

          {notice && (
            <p className="gq-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="gq-error" role="alert">
              {error}
            </p>
          )}

          {conflict && (
            <div className="gq-warning" role="alert">
              <p>โต๊ะนี้มีลูกค้าอยู่ระหว่างทานอาหาร กรุณาปิดออเดอร์เดิมก่อน</p>
              <button type="button" className="gq-btn gq-btn-danger" onClick={askCloseOld}>
                ปิดออเดอร์เดิม
              </button>
            </div>
          )}

          <button type="submit" className="gq-btn gq-btn-primary" disabled={loading}>
            {loading ? "กำลังตรวจสอบ..." : "เปิดโต๊ะ"}
          </button>
        </form>
      )}

      {confirmOpen && conflict && (
        <div className="gq-overlay">
          <div className="gq-dialog" role="dialog" aria-modal="true" aria-labelledby="gq-dialog-title">
            <h2 id="gq-dialog-title">ยืนยันปิดโต๊ะเดิม?</h2>
            <ul>
              <li>โต๊ะ {conflict.table_number}</li>
              <li>
                ผู้ใหญ่ {conflict.adult_count} · เด็ก {conflict.child_count}
              </li>
              <li>เปิดมาแล้ว {minutesSince(conflict.created_at, nowAtOpen)} นาที</li>
            </ul>
            <div className="gq-dialog-actions">
              <button
                type="button"
                className="gq-btn"
                onClick={() => setConfirmOpen(false)}
                disabled={closing}
                autoFocus
              >
                ยกเลิก
              </button>
              <button type="button" className="gq-btn gq-btn-danger" onClick={confirmCloseOld} disabled={closing}>
                {closing ? "กำลังปิด..." : "ยืนยันปิดโต๊ะเดิม"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const css = `
.gq { max-width: 520px; margin: 0 auto; padding: 1.5rem 1rem 3rem; font-size: 1.25rem; }
.gq-title { font-size: 2rem; margin: 0 0 1rem; color: var(--fuji); }
.gq-card { display: flex; flex-direction: column; gap: 1.1rem; background: #fff; border: 2px solid #d9e0ee; border-radius: 16px; padding: 1.25rem; }
.gq-field { display: flex; flex-direction: column; gap: 0.35rem; font-weight: 600; }
.gq-field input { font: inherit; font-size: 1.6rem; padding: 0.6rem 0.8rem; border: 2px solid #b8c3da; border-radius: 12px; width: 100%; }
.gq-field input:focus-visible { outline: 3px solid var(--fuji); outline-offset: 1px; }
.gq-btn { font: inherit; font-weight: 700; padding: 0.85rem 1.25rem; border-radius: 12px; border: 2px solid #b8c3da; background: #fff; color: var(--ink); cursor: pointer; }
.gq-btn:focus-visible { outline: 3px solid var(--fuji); outline-offset: 2px; }
.gq-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.gq-btn-primary { background: var(--fuji); border-color: var(--fuji); color: #fff; font-size: 1.4rem; padding: 1rem; }
.gq-btn-danger { background: #c62828; border-color: #c62828; color: #fff; }
.gq-btn-small { font-size: 1rem; padding: 0.45rem 0.8rem; white-space: nowrap; }
.gq-warning { background: #fff3e0; border: 3px solid #e65100; border-radius: 14px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; color: #7a2e00; font-weight: 700; }
.gq-warning p { margin: 0; }
.gq-error { margin: 0; background: #fdecea; border: 2px solid #c62828; color: #8e1b1b; border-radius: 12px; padding: 0.75rem 1rem; font-weight: 600; }
.gq-notice { margin: 0; background: #e8f5e9; border: 2px solid #2e7d32; color: #1b5e20; border-radius: 12px; padding: 0.75rem 1rem; font-weight: 600; }
.gq-result { align-items: center; text-align: center; }
.gq-qr { width: 100%; max-width: 300px; height: auto; border: 1px solid #d9e0ee; border-radius: 8px; }
.gq-summary { margin: 0; font-size: 1.6rem; font-weight: 700; }
.gq-linkrow { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.6rem; }
.gq-link { font-size: 1.05rem; word-break: break-all; color: var(--fuji); font-weight: 600; }
.gq-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 50; }
.gq-dialog { background: #fff; border: 4px solid #c62828; border-radius: 16px; padding: 1.5rem; width: 100%; max-width: 440px; }
.gq-dialog h2 { margin: 0 0 0.75rem; color: #c62828; font-size: 1.6rem; }
.gq-dialog ul { list-style: none; margin: 0 0 1.25rem; padding: 0; font-size: 1.3rem; font-weight: 600; display: flex; flex-direction: column; gap: 0.3rem; }
.gq-dialog-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: flex-end; }
`;
