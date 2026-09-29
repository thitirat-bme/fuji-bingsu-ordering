"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const PRICE_ADULT = 289;
const PRICE_CHILD = 145;
const MAX_QTY_PER_ITEM = 5;
const MAX_ITEMS_PER_ORDER = 10;

function formatBaht(n) {
  return n.toLocaleString("th-TH") + " บาท";
}

function FullMessage({ title, text }) {
  return (
    <main className="od-full">
      <style>{css}</style>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
    </main>
  );
}

export default function OrderPage({ params }) {
  // Next.js เวอร์ชันล่าสุด: params เป็น Promise ต้อง unwrap ด้วย use() เสมอ
  const { tableNumber } = use(params);
  const table = Number(tableNumber);

  const [phase, setPhase] = useState("loading"); // loading | notOpen | ready | thanks | error
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [session, setSession] = useState(null); // { id, adult_count, child_count }
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCat, setActiveCat] = useState(null);

  const [cart, setCart] = useState([]); // [{ id, name, quantity }]
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);
  const [hint, setHint] = useState("");

  const [billOpen, setBillOpen] = useState(false);
  const [billing, setBilling] = useState(false);
  const [billError, setBillError] = useState("");

  // 1) เช็ค session ของโต๊ะ แล้วโหลดเมนู
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPhase("loading");
      setLoadError("");

      if (!Number.isInteger(table) || table < 1) {
        setPhase("notOpen");
        return;
      }

      try {
        const { data: sessions, error: sessionError } = await supabase
          .from("sessions")
          .select("id, adult_count, child_count")
          .eq("table_number", table)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1);

        if (sessionError) throw sessionError;
        if (cancelled) return;

        if (!sessions || sessions.length === 0) {
          setPhase("notOpen");
          return;
        }

        const [catRes, itemRes] = await Promise.all([
          supabase.from("menu_categories").select("id, name, sort_order").order("sort_order", { ascending: true }),
          supabase.from("menu_items").select("id, category_id, name").order("id", { ascending: true }),
        ]);

        if (catRes.error) throw catRes.error;
        if (itemRes.error) throw itemRes.error;
        if (cancelled) return;

        setSession(sessions[0]);
        setCategories(catRes.data || []);
        setItems(itemRes.data || []);
        setActiveCat((catRes.data && catRes.data[0] && catRes.data[0].id) ?? null);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err?.message || "ไม่ทราบสาเหตุ");
        setPhase("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [table, reloadKey]);

  // ข้อความ "ส่งออเดอร์แล้ว" ค้างไว้สักครู่แล้วหายเอง
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(false), 4000);
    return () => clearTimeout(t);
  }, [sent]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(""), 2500);
    return () => clearTimeout(t);
  }, [hint]);

  // กด Esc ปิดหน้าต่างยืนยัน
  useEffect(() => {
    if (!billOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !billing) setBillOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [billOpen, billing]);

  const qtyOf = (id) => cart.find((c) => c.id === id)?.quantity ?? 0;

  function addItem(item) {
    const existing = cart.find((c) => c.id === item.id);
    if (existing) {
      if (existing.quantity >= MAX_QTY_PER_ITEM) {
        setHint(`สั่งได้สูงสุด ${MAX_QTY_PER_ITEM} ชิ้นต่อรายการ`);
        return;
      }
      setCart(cart.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)));
    } else {
      if (cart.length >= MAX_ITEMS_PER_ORDER) {
        setHint(`เลือกได้สูงสุด ${MAX_ITEMS_PER_ORDER} รายการต่อการส่ง 1 ครั้ง`);
        return;
      }
      setCart([...cart, { id: item.id, name: item.name, quantity: 1 }]);
    }
    setSendError("");
  }

  function decItem(id) {
    setCart(
      cart
        .map((c) => (c.id === id ? { ...c, quantity: c.quantity - 1 } : c))
        .filter((c) => c.quantity > 0)
    );
  }

  function removeItem(id) {
    setCart(cart.filter((c) => c.id !== id));
  }

  async function submitOrder() {
    if (sending || cart.length === 0 || !session) return;
    setSending(true);
    setSendError("");
    try {
      // กันกรณีพนักงานปิดโต๊ะไปแล้วระหว่างที่ลูกค้าเลือกเมนู
      const { data: stillOpen, error: checkError } = await supabase
        .from("sessions")
        .select("id")
        .eq("id", session.id)
        .eq("status", "open")
        .limit(1);
      if (checkError) throw checkError;
      if (!stillOpen || stillOpen.length === 0) {
        setPhase("notOpen");
        return;
      }

      const { error: insertError } = await supabase.from("orders").insert({
        session_id: session.id,
        table_number: table,
        items: cart.map(({ name, quantity }) => ({ name, quantity })),
        status: "received",
      });
      if (insertError) throw insertError;

      setCart([]);
      setCartOpen(false);
      setSent(true);
    } catch (err) {
      setSendError("ส่งออเดอร์ไม่สำเร็จ: " + (err?.message || "ไม่ทราบสาเหตุ") + " — กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSending(false);
    }
  }

  async function confirmBill() {
    if (billing || !session) return;
    setBilling(true);
    setBillError("");
    try {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", session.id)
        .eq("status", "open");
      if (updateError) throw updateError;

      setBillOpen(false);
      setPhase("thanks");
    } catch (err) {
      setBillError("เรียกเก็บเงินไม่สำเร็จ: " + (err?.message || "ไม่ทราบสาเหตุ") + " — กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBilling(false);
    }
  }

  if (phase === "loading") {
    return <FullMessage title="กำลังโหลดเมนู..." />;
  }
  if (phase === "notOpen") {
    return <FullMessage title="โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงาน" />;
  }
  if (phase === "thanks") {
    return <FullMessage title="ขอบคุณที่ใช้บริการ" />;
  }
  if (phase === "error") {
    return (
      <main className="od-full">
        <style>{css}</style>
        <h1>โหลดข้อมูลไม่สำเร็จ</h1>
        <p>{loadError}</p>
        <button type="button" className="od-btn od-btn-primary" onClick={() => setReloadKey((k) => k + 1)}>
          ลองอีกครั้ง
        </button>
      </main>
    );
  }

  const total = session.adult_count * PRICE_ADULT + session.child_count * PRICE_CHILD;
  const visibleItems = items.filter((i) => i.category_id === activeCat);
  const totalPieces = cart.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="od">
      <style>{css}</style>

      <header className="od-header">
        <div className="od-header-top">
          <div>
            <div className="od-shop">บิงซูภูเขาฟูจิ</div>
            <div className="od-table">โต๊ะ {table}</div>
          </div>
          <button
            type="button"
            className="od-btn od-btn-bill"
            onClick={() => {
              setBillError("");
              setBillOpen(true);
            }}
          >
            เรียกเก็บเงิน
          </button>
        </div>

        <div className="od-tabs" role="tablist" aria-label="หมวดหมู่เมนู">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={cat.id === activeCat}
              className={"od-tab" + (cat.id === activeCat ? " od-tab-active" : "")}
              onClick={() => setActiveCat(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {sent && (
        <div className="od-sent" role="status">
          ส่งออเดอร์แล้ว
        </div>
      )}

      <main className="od-list" role="tabpanel">
        {visibleItems.length === 0 && <p className="od-empty">ยังไม่มีเมนูในหมวดนี้</p>}
        {visibleItems.map((item) => {
          const q = qtyOf(item.id);
          return (
            <div key={item.id} className="od-item">
              <span className="od-item-name">{item.name}</span>
              {q === 0 ? (
                <button type="button" className="od-round od-round-add" onClick={() => addItem(item)} aria-label={`เพิ่ม ${item.name}`}>
                  +
                </button>
              ) : (
                <div className="od-stepper">
                  <button type="button" className="od-round" onClick={() => decItem(item.id)} aria-label={`ลด ${item.name}`}>
                    −
                  </button>
                  <span className="od-qty" aria-live="polite">
                    {q}
                  </span>
                  <button type="button" className="od-round od-round-add" onClick={() => addItem(item)} aria-label={`เพิ่ม ${item.name}`}>
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </main>

      {hint && (
        <div className="od-hint" role="status">
          {hint}
        </div>
      )}

      {cart.length > 0 && (
        <div className="od-cartbar">
          {cartOpen && (
            <div className="od-cartlist">
              {cart.map((c) => (
                <div key={c.id} className="od-cartline">
                  <span className="od-cartline-name">{c.name}</span>
                  <div className="od-stepper">
                    <button type="button" className="od-round od-round-sm" onClick={() => decItem(c.id)} aria-label={`ลด ${c.name}`}>
                      −
                    </button>
                    <span className="od-qty">{c.quantity}</span>
                    <button type="button" className="od-round od-round-sm od-round-add" onClick={() => addItem(c)} aria-label={`เพิ่ม ${c.name}`}>
                      +
                    </button>
                  </div>
                  <button type="button" className="od-remove" onClick={() => removeItem(c.id)}>
                    ลบ
                  </button>
                </div>
              ))}
            </div>
          )}
          {sendError && (
            <p className="od-error" role="alert">
              {sendError}
            </p>
          )}
          <div className="od-cartrow">
            <button type="button" className="od-cartsummary" onClick={() => setCartOpen(!cartOpen)} aria-expanded={cartOpen}>
              <span className="od-badge">{cart.length}</span>
              <span>
                ตะกร้า ({cart.length}/{MAX_ITEMS_PER_ORDER} รายการ · {totalPieces} ชิ้น)
              </span>
            </button>
            <button type="button" className="od-btn od-btn-primary od-send" onClick={submitOrder} disabled={sending}>
              {sending ? "กำลังส่ง..." : "ส่งออเดอร์"}
            </button>
          </div>
        </div>
      )}

      {billOpen && (
        <div className="od-overlay">
          <div className="od-dialog" role="dialog" aria-modal="true" aria-labelledby="od-bill-title">
            <h2 id="od-bill-title">เรียกเก็บเงิน</h2>
            <ul>
              <li>
                ผู้ใหญ่ {session.adult_count} × {PRICE_ADULT} = {formatBaht(session.adult_count * PRICE_ADULT)}
              </li>
              <li>
                เด็ก {session.child_count} × {PRICE_CHILD} = {formatBaht(session.child_count * PRICE_CHILD)}
              </li>
            </ul>
            <p className="od-total">ยอดที่ต้องจ่าย {formatBaht(total)}</p>
            {cart.length > 0 && <p className="od-warn">มีรายการในตะกร้าที่ยังไม่ได้ส่ง หากเรียกเก็บเงินจะไม่ถูกส่งไปที่ครัว</p>}
            {billError && (
              <p className="od-error" role="alert">
                {billError}
              </p>
            )}
            <div className="od-dialog-actions">
              <button type="button" className="od-btn" onClick={() => setBillOpen(false)} disabled={billing} autoFocus>
                ยกเลิก
              </button>
              <button type="button" className="od-btn od-btn-primary" onClick={confirmBill} disabled={billing}>
                {billing ? "กำลังดำเนินการ..." : "ยืนยันเรียกเก็บเงิน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const css = `
.od { min-height: 100vh; padding-bottom: 9rem; font-size: 1.15rem; }
.od-full { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 2rem 1.5rem; text-align: center; }
.od-full h1 { margin: 0; font-size: 1.9rem; line-height: 1.4; color: var(--fuji); }
.od-full p { margin: 0; color: var(--muted); }

.od-header { position: sticky; top: 0; z-index: 20; background: var(--snow); border-bottom: 2px solid #d9e0ee; }
.od-header-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem 0.5rem; }
.od-shop { font-size: 1.35rem; font-weight: 700; color: var(--fuji); line-height: 1.2; }
.od-table { font-size: 1rem; color: var(--muted); }

.od-tabs { display: flex; gap: 0.5rem; overflow-x: auto; padding: 0.25rem 1rem 0.75rem; scrollbar-width: none; }
.od-tabs::-webkit-scrollbar { display: none; }
.od-tab { flex: 0 0 auto; font: inherit; font-weight: 600; padding: 0.6rem 1.1rem; min-height: 48px; border-radius: 999px; border: 2px solid #b8c3da; background: #fff; color: var(--ink); cursor: pointer; white-space: nowrap; }
.od-tab-active { background: var(--fuji); border-color: var(--fuji); color: #fff; }
.od-tab:focus-visible, .od-btn:focus-visible, .od-round:focus-visible, .od-cartsummary:focus-visible, .od-remove:focus-visible { outline: 3px solid var(--fuji); outline-offset: 2px; }

.od-list { padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
.od-empty { text-align: center; color: var(--muted); margin-top: 2rem; }
.od-item { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; background: #fff; border: 2px solid #e1e7f2; border-radius: 16px; padding: 0.75rem 0.9rem; }
.od-item-name { font-size: 1.2rem; font-weight: 600; line-height: 1.4; }

.od-stepper { display: flex; align-items: center; gap: 0.5rem; flex: 0 0 auto; }
.od-qty { min-width: 1.6rem; text-align: center; font-size: 1.3rem; font-weight: 700; }
.od-round { font: inherit; font-size: 1.6rem; font-weight: 700; line-height: 1; width: 52px; height: 52px; border-radius: 50%; border: 2px solid #b8c3da; background: #fff; color: var(--ink); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.od-round-add { background: var(--sakura-soft); border-color: var(--sakura); color: #8a2f4b; }
.od-round-sm { width: 44px; height: 44px; font-size: 1.4rem; }

.od-btn { font: inherit; font-weight: 700; min-height: 52px; padding: 0.7rem 1.2rem; border-radius: 14px; border: 2px solid #b8c3da; background: #fff; color: var(--ink); cursor: pointer; }
.od-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.od-btn-primary { background: var(--fuji); border-color: var(--fuji); color: #fff; }
.od-btn-bill { min-height: 48px; padding: 0.5rem 1rem; font-size: 1rem; border-color: var(--sakura); background: var(--sakura-soft); color: #8a2f4b; }

.od-sent { position: fixed; top: 5.5rem; left: 50%; transform: translateX(-50%); z-index: 30; background: #2e7d32; color: #fff; font-weight: 700; padding: 0.75rem 1.5rem; border-radius: 999px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
.od-hint { position: fixed; left: 50%; bottom: 6.5rem; transform: translateX(-50%); z-index: 30; max-width: calc(100% - 2rem); background: #1d2b45; color: #fff; font-size: 1rem; padding: 0.6rem 1rem; border-radius: 12px; text-align: center; }

.od-cartbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 25; background: #fff; border-top: 2px solid #d9e0ee; padding: 0.6rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px)); box-shadow: 0 -4px 14px rgba(0,0,0,0.08); }
.od-cartlist { max-height: 40vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem; padding-bottom: 0.6rem; }
.od-cartline { display: flex; align-items: center; gap: 0.6rem; }
.od-cartline-name { flex: 1 1 auto; font-weight: 600; line-height: 1.3; }
.od-remove { font: inherit; font-size: 0.95rem; min-height: 44px; padding: 0 0.6rem; border: none; background: none; color: #c62828; font-weight: 700; cursor: pointer; }
.od-cartrow { display: flex; align-items: center; gap: 0.75rem; }
.od-cartsummary { font: inherit; font-weight: 600; flex: 1 1 auto; min-height: 52px; display: flex; align-items: center; gap: 0.6rem; text-align: left; background: none; border: none; color: var(--ink); cursor: pointer; padding: 0; }
.od-badge { flex: 0 0 auto; min-width: 2rem; height: 2rem; padding: 0 0.4rem; border-radius: 999px; background: var(--sakura); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; }
.od-send { flex: 0 0 auto; }

.od-error { margin: 0 0 0.5rem; background: #fdecea; border: 2px solid #c62828; color: #8e1b1b; border-radius: 12px; padding: 0.6rem 0.9rem; font-weight: 600; font-size: 1rem; }
.od-warn { margin: 0; background: #fff3e0; border: 2px solid #e65100; color: #7a2e00; border-radius: 12px; padding: 0.6rem 0.9rem; font-weight: 600; font-size: 1rem; }

.od-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
.od-dialog { width: 100%; max-width: 440px; background: #fff; border-radius: 18px; padding: 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
.od-dialog h2 { margin: 0; color: var(--fuji); font-size: 1.6rem; }
.od-dialog ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; font-size: 1.15rem; }
.od-total { margin: 0; font-size: 1.6rem; font-weight: 700; }
.od-dialog-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: flex-end; }
`;
