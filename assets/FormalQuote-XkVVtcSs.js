import{s as P,r as f,a as U,c as I,j as t,p as O}from"./index-BKqwdqQ2.js";import{a as A,g as Z,f as E,C as W,e as B,P as y}from"./utils-CgBJMdzV.js";import{S as H}from"./StatCard-CqIZNRLp.js";const d={nameZh:"展億室內開發有限公司",nameEn:"Door World",brandZh:"門的世界",taxId:"60667469",addr:"新北市五股區成泰路一段130-3號",phone:"02-2292-0366",web:"doorworld.com.tw",tagline:"頂級大門・專業安裝・品質保證"},Q={single:"單門",mother:"子母門",double:"雙開門",fire:"防火單門",room:"房間門",bathroom:"衛浴門",sliding:"橫拉門"},Y={none:"一般（非防火）",f60a:"F60A 防火",f60a_smoke:"F60A 防火遮煙"};function z(e){return e||e===0?"NT$ "+Number(e).toLocaleString():"—"}function F(e){return(e?new Date(e):new Date).toLocaleDateString("zh-TW",{year:"numeric",month:"long",day:"numeric"})}function i(e){return String(e??"").replace(/[<>&"]/g,n=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"})[n])}async function G(e){if(!e){alert("找不到報價單資料");return}let n="";if(e.product_code)try{const a=await P(`products?full_code=eq.${encodeURIComponent(e.product_code)}&select=thumbnail_url`);n=a&&a[0]&&a[0].thumbnail_url||""}catch{}const o=e.formal_quote_data||{},k=Array.isArray(o.accessories)?o.accessories:[],r=Array.isArray(o.special_requirements)?o.special_requirements:[],x=e.formal_quote_no||e.order_no||e.case_no||"—",c=F(null),S=F(e.created_at),l=Q[e.door_type]||e.door_type||"—",N=Y[o.fire_type]||(e.is_fireproof?"防火":"一般"),_=e.actual_width_cm||(o.width_mm?Math.round(o.width_mm/10):""),v=e.actual_height_cm||(o.height_mm?Math.round(o.height_mm/10):""),C=_&&v?`寬 ${_} × 高 ${v} cm`:"—",h=e.quantity||1,u=k.map(a=>{const b=a.useUpgrade&&a.upgrade?a.upgrade:a.standard,w=a.useUpgrade&&a.upgrade?"升級":"標配";return{label:a.label||a.key,item:b||"—",level:w}}).filter(a=>a.item&&a.item!=="—"),j=u.length===0?"":`
    <div class="sec"><div class="stitle"><span class="stitle-txt">五金配件</span></div>
    <table class="bd-table">
      <colgroup><col style="width:90px"><col><col style="width:54px"></colgroup>
      ${u.map(a=>`<tr>
        <td class="bdl">${i(a.label)}</td>
        <td class="bdv" style="text-align:left;font-weight:500">${i(a.item)}</td>
        <td class="bdv" style="text-align:center;font-size:9px;color:${a.level==="升級"?"#c9a227":"#888"}">${a.level}</td>
      </tr>`).join("")}
    </table></div>`,$=[["開門方向",o.door_direction],["交貨方式",o.delivery_type],["安裝方式",o.install_method],["有無電梯",o.has_elevator===!0?"有":o.has_elevator===!1?"無":null],["畫框",o.art_frame&&o.art_frame!=="無"?o.art_frame:null]].filter(([,a])=>a),s=$.length===0?"":`
    <div class="sec"><div class="stitle"><span class="stitle-txt">安裝規格</span></div>
    <table class="spec-grid">
      ${$.reduce((a,b,w)=>(w%2===0?a.push([b]):a[a.length-1].push(b),a),[]).map(a=>`<tr>${a.map(([b,w])=>`<td class="tdl">${i(b)}</td><td class="tdv">${i(w)}</td>`).join("")}${a.length===1?'<td class="tdl" style="border:none;background:none"></td><td class="tdv" style="border:none;background:none"></td>':""}</tr>`).join("")}
    </table></div>`,p=r.length===0?"":`
    <div class="sec"><div class="stitle"><span class="stitle-txt">特殊需求</span></div>
    <div class="special-box">${r.map(a=>`<span class="tag">${i(a)}</span>`).join("")}</div></div>`,g=Number(e.total_with_tax||0),m=g?Math.round(g/1.05):Number(e.official_price||0),T=g?g-m:Math.round(m*.05),R=g||m+T,D=h>0?Math.round(m/h):m,L=n?`<img src="${i(n)}" style="width:120px;height:120px;object-fit:cover;border:1px solid #d4af37;display:block" crossorigin="anonymous">`:'<div style="width:120px;height:120px;border:1px dashed #d4af37;display:flex;align-items:center;justify-content:center;font-size:9px;color:#c9a227;letter-spacing:1px">暫無圖片</div>',M=`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>報價單 ${i(x)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm}
body{font-family:"Noto Sans TC",sans-serif;background:#fff;color:#1a1a1a;font-size:11px;line-height:1.55}
.page{width:210mm;min-height:297mm;padding:12mm 14mm 10mm;display:flex;flex-direction:column}
.hdr{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:10px;border-bottom:2.5px solid #c9a227;margin-bottom:10px}
.logo-zh{font-size:30px;font-weight:900;color:#1a1a1a;letter-spacing:2px;line-height:1}
.logo-en{font-size:10px;font-weight:700;color:#c9a227;letter-spacing:4px;text-transform:uppercase;margin-top:3px}
.co-info{font-size:8.5px;color:#666;line-height:1.65;margin-top:6px}
.co-info strong{color:#1a1a1a;font-weight:700}
.hdr-r{text-align:right;flex-shrink:0}
.doc-type{font-size:9px;font-weight:700;letter-spacing:4px;color:#888;text-transform:uppercase;margin-bottom:4px}
.qno{font-size:16px;font-weight:900;color:#1a1a1a;letter-spacing:1px}
.badge{display:inline-block;margin-top:4px;padding:3px 12px;border-radius:2px;font-size:9px;font-weight:700;letter-spacing:1px;color:#fff;background:#1a5c38}
.doc-date{font-size:9px;color:#666;margin-top:6px}
.infobar{display:flex;border:1px solid #d4af37;margin-bottom:8px}
.ic{flex:1;padding:7px 12px;border-right:1px solid #d4af37}
.ic:last-child{border-right:none}
.icl{font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a227;text-transform:uppercase;margin-bottom:3px}
.icv{font-size:11.5px;font-weight:700;color:#1a1a1a}
.addr{margin-bottom:8px;padding:6px 11px;background:#f9f6ec;border:1px solid #d4af37;font-size:10.5px;color:#3a3a3a}
.addr-lbl{font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a227;margin-right:8px}
.stitle{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.stitle-txt{font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;white-space:nowrap;padding:3px 10px;background:#1a1a1a;color:#c9a227}
.stitle::after{content:"";flex:1;height:1px;background:#d4af37}
.sec{margin-bottom:9px}
.prod-row{display:flex;gap:11px;align-items:flex-start}
.prod-info{flex:1}
table{width:100%;border-collapse:collapse}
.tdl{width:95px;padding:5px 10px;background:#f9f6ec;color:#555;font-size:9.5px;font-weight:600;border:1px solid #e2d5a0;vertical-align:middle}
.tdv{padding:5px 10px;color:#1a1a1a;font-size:11px;border:1px solid #e2d5a0;word-break:break-word}
.spec-grid .tdl{width:68px}
.spec-grid .tdv{font-size:10.5px}
.bd-table{border:1px solid #e2d5a0}
.bdl{padding:5px 12px;background:#f9f6ec;color:#555;font-size:10px;font-weight:600;border-bottom:1px solid #e8dfb8}
.bdv{padding:5px 12px;color:#1a1a1a;font-size:11px;text-align:right;font-weight:600;border-bottom:1px solid #e8dfb8;font-variant-numeric:tabular-nums}
.bd-table tr:last-child .bdl,.bd-table tr:last-child .bdv{border-bottom:none}
.special-box{padding:8px 10px;background:#fff8e5;border:1px dashed #d4af37;border-radius:3px}
.tag{display:inline-block;padding:2px 10px;background:#1a1a1a;color:#c9a227;font-size:10px;font-weight:700;border-radius:2px;margin:2px 4px 2px 0;letter-spacing:1px}
.tax-box{margin-top:8px;border:1px solid #1a1a1a}
.tax-row{display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #333}
.tax-row:last-child{border-bottom:none;background:#1a1a1a;color:#c9a227}
.tax-row.subtotal,.tax-row.tax{background:#fafafa}
.tax-lbl{font-size:10px;font-weight:600;letter-spacing:1px;color:#555}
.tax-val{font-size:12px;font-weight:700;color:#1a1a1a;font-variant-numeric:tabular-nums}
.tax-row:last-child .tax-lbl{color:#c9a227;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
.tax-row:last-child .tax-val{color:#c9a227;font-size:22px;font-weight:900;letter-spacing:1px}
.disclaimer{margin-top:7px;padding:6px 10px;background:#f9f6ec;border-left:3px solid #c9a227;font-size:8.5px;color:#666;line-height:1.75}
.spacer{flex:1;min-height:10px}
.sign-row{display:flex;gap:14px;margin-top:14px;margin-bottom:12px}
.sign-box{flex:1;border:1px solid #ccc;padding:10px 14px;min-height:68px;position:relative}
.sign-lbl{font-size:8.5px;font-weight:700;letter-spacing:2px;color:#888;text-transform:uppercase;position:absolute;top:-7px;left:10px;background:#fff;padding:0 6px}
.sign-date{position:absolute;bottom:6px;right:10px;font-size:8px;color:#999}
.foot{padding-top:8px;border-top:1px solid #d4af37;display:flex;justify-content:space-between;align-items:flex-end;font-size:9px;color:#666}
.foot-brand{font-size:11px;font-weight:900;color:#1a1a1a;letter-spacing:1px}
.noprint{text-align:center;padding:12px;background:#1a1a1a;border-bottom:2px solid #c9a227}
.noprint button{background:#c9a227;color:#1a1a1a;border:none;padding:9px 30px;font-size:13px;font-weight:900;cursor:pointer;font-family:"Noto Sans TC",sans-serif;letter-spacing:2px}
@media print{.noprint{display:none}html,body{width:210mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{page-break-after:avoid}@page{margin:0;size:A4}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">列印 / 儲存 PDF</button></div>
<div class="page">
  <div class="hdr">
    <div>
      <div class="logo-zh">${d.brandZh}</div>
      <div class="logo-en">${d.nameEn}</div>
      <div class="co-info">
        <strong>${d.nameZh}</strong>　統編 ${d.taxId}<br>
        ${d.addr}　T. ${d.phone}<br>
        ${d.web}
      </div>
    </div>
    <div class="hdr-r">
      <div class="doc-type">正式報價單 Formal Quotation</div>
      <div class="qno">${i(x)}</div>
      <span class="badge">正式報價</span>
      <div class="doc-date">${S}</div>
    </div>
  </div>
  <div class="infobar">
    <div class="ic"><div class="icl">客戶姓名</div><div class="icv">${i(e.customer_name||"—")}</div></div>
    <div class="ic"><div class="icl">聯絡電話</div><div class="icv">${i(e.customer_phone||"—")}</div></div>
    ${e.sales_person?`<div class="ic"><div class="icl">業務窗口</div><div class="icv">${i(e.sales_person)}</div></div>`:""}
  </div>
  ${e.case_address?`<div class="addr"><span class="addr-lbl">施工地址</span>${i(e.case_address)}</div>`:""}

  <div class="sec"><div class="stitle"><span class="stitle-txt">產品資訊</span></div>
    <div class="prod-row">
      <div class="prod-info"><table>
        <tr><td class="tdl">產品編號</td><td class="tdv" style="font-family:monospace;font-size:12px;font-weight:700">${i(e.product_code||"—")}</td></tr>
        <tr><td class="tdl">門型</td><td class="tdv">${i(l)}</td></tr>
        <tr><td class="tdl">防火規格</td><td class="tdv">${i(N)}</td></tr>
        <tr><td class="tdl">尺寸規格</td><td class="tdv">${i(C)}</td></tr>
        <tr><td class="tdl">數量</td><td class="tdv">${h} 樘</td></tr>
      </table></div>
      <div style="flex-shrink:0">${L}</div>
    </div>
  </div>

  ${s}
  ${j}
  ${p}

  <div class="sec"><div class="stitle"><span class="stitle-txt">金額明細</span></div>
    <table class="bd-table">
      <tr><td class="bdl">單樘報價（未稅）</td><td class="bdv">${z(D)}</td></tr>
      <tr><td class="bdl">數量</td><td class="bdv">× ${h} 樘</td></tr>
    </table>
    <div class="tax-box">
      <div class="tax-row subtotal"><div class="tax-lbl">小計（未稅）</div><div class="tax-val">${z(m)}</div></div>
      <div class="tax-row tax"><div class="tax-lbl">營業稅 5%</div><div class="tax-val">${z(T)}</div></div>
      <div class="tax-row"><div class="tax-lbl">含稅總計</div><div class="tax-val">${z(R)}</div></div>
    </div>
  </div>

  <div class="disclaimer">
    ・本報價單為正式報價，經雙方簽署後生效，報價含大門本體、五金配件與基礎安裝。
    ・付款方式：簽約時付 50% 訂金，到貨安裝完成驗收後付尾款 50%。
    ・本報價有效期限自出單日起 <strong>30 天</strong>，逾期請重新詢價。
  </div>

  <div class="spacer"></div>

  <div class="sign-row">
    <div class="sign-box"><span class="sign-lbl">客戶簽章</span><span class="sign-date">日期：　　　年　　月　　日</span></div>
    <div class="sign-box"><span class="sign-lbl">公司簽章</span><span class="sign-date">${d.nameZh}</span></div>
  </div>

  <div class="foot">
    <div><span class="foot-brand">${d.brandZh} ${d.nameEn}</span>　${d.tagline}</div>
    <div>列印日期：${c}</div>
  </div>
</div>
</body></html>`,q=window.open("","_blank","width=820,height=1160");if(!q){alert("請允許彈出視窗以列印 PDF");return}q.document.write(M),q.document.close()}function X(){const[e,n]=f.useState([]),[o,k]=f.useState(0),[r,x]=f.useState(0),[c,S]=f.useState(""),[l,N]=f.useState("all"),[_,v]=f.useState(!0),C=U(),h=I();async function u(){v(!0);let s="cases?select=*&order=created_at.desc";c&&(s+=`&or=(case_no.ilike.*${encodeURIComponent(c)}*,customer_name.ilike.*${encodeURIComponent(c)}*,order_no.ilike.*${encodeURIComponent(c)}*)`),l!=="all"&&(s+=`&status=eq.${l}`);try{k(await O(s.replace("select=*","select=id"))),n(await P(s+`&offset=${r*y}&limit=${y}`)||[])}catch(p){C(p.message,"error")}v(!1)}f.useEffect(()=>{u()},[c,l,r]);const j=r*y+1,$=Math.min(j+y-1,o);return t.jsxs("div",{children:[t.jsxs("div",{className:"page-header",children:[t.jsxs("div",{className:"page-title-wrap",children:[t.jsx("div",{className:"page-title",children:"報價單總表"}),t.jsx("div",{className:"page-subtitle",children:"所有正式報價單 — 追蹤報價 → 成案 → 付款 → 發包 → 完工"})]}),t.jsx("button",{className:"btn btn-primary",onClick:()=>h("/formalquote/new"),children:"+ 新增報價單"})]}),t.jsx("div",{className:"stats",children:t.jsx(H,{label:"總數",value:o})}),t.jsx("div",{style:{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"},children:[["all","全部"],["official_quoted","已報價"],["order_confirmed","已下單"],["deposit_paid","已付訂","var(--success)"],["production","製作中","#3b82f6"],["shipped","已出貨","#f59e0b"],["arrived","已到倉"],["installed","已安裝","var(--success)"],["completed","已結案","var(--success)"],["cancelled","已取消","var(--danger)"]].map(([s,p,g])=>t.jsx("button",{onClick:()=>{N(s),x(0)},style:{padding:"5px 11px",borderRadius:6,fontSize:12,cursor:"pointer",fontFamily:"var(--font-body)",border:`1px solid ${l===s?"var(--gold)":"var(--border)"}`,background:l===s?"var(--gold-dim)":"var(--surface-2)",color:l===s?g||"var(--gold)":"var(--text-muted)",fontWeight:l===s?700:500},children:p},s))}),t.jsxs("div",{style:{display:"flex",gap:8,marginBottom:14},children:[t.jsx("input",{className:"search-box",placeholder:"搜尋單號、客戶...",value:c,onChange:s=>{S(s.target.value),x(0)},style:{width:250}}),t.jsx("button",{className:"btn btn-ghost",onClick:u,children:"↻"})]}),t.jsx("div",{className:"table-wrap",children:t.jsxs("table",{children:[t.jsx("thead",{children:t.jsxs("tr",{children:[t.jsx("th",{children:"訂單編號"}),t.jsx("th",{children:"客戶"}),t.jsx("th",{children:"型態"}),t.jsx("th",{children:"業務"}),t.jsx("th",{children:"報價金額"}),t.jsx("th",{children:"總價"}),t.jsx("th",{children:"狀態"}),t.jsx("th",{children:"建立"}),t.jsx("th",{style:{width:50},children:"PDF"})]})}),t.jsx("tbody",{children:_?t.jsx("tr",{children:t.jsx("td",{colSpan:"9",children:t.jsxs("div",{className:"loading",children:[t.jsx("div",{className:"spinner"}),t.jsx("br",{}),"載入中..."]})})}):e.length===0?t.jsx("tr",{children:t.jsx("td",{colSpan:"9",children:t.jsxs("div",{className:"empty",children:[t.jsx("div",{className:"icon",children:"📋"}),"無資料"]})})}):e.map(s=>{const p=A[s.status]||A.new;return t.jsxs("tr",{children:[t.jsx("td",{children:t.jsx("strong",{style:{fontFamily:"monospace",fontSize:11},children:s.order_no||s.case_no||"—"})}),t.jsx("td",{children:s.customer_name||"—"}),t.jsx("td",{style:{fontSize:11},children:Z[s.customer_type]||s.customer_type||"—"}),t.jsx("td",{style:{fontSize:12},children:s.sales_person||"—"}),t.jsx("td",{className:"price",children:E(s.official_price||s.quoted_price)}),t.jsx("td",{className:"price",children:E(s.total_with_tax)}),t.jsx("td",{children:t.jsx("span",{className:"badge",style:{background:p.bg,color:p.color},children:W[s.status]||s.status})}),t.jsx("td",{style:{fontSize:12,color:"var(--text-muted)"},children:B(s.created_at)}),t.jsx("td",{children:t.jsx("button",{onClick:()=>G(s),title:"列印報價單 PDF",style:{background:"transparent",border:"1px solid var(--gold)",borderRadius:4,padding:"4px 9px",cursor:"pointer",color:"var(--gold)",fontSize:11,fontWeight:600},children:"PDF"})})]},s.id)})})]})}),t.jsxs("div",{className:"pagination",children:[t.jsx("span",{children:o?`${j}-${$} / ${o}`:""}),t.jsxs("div",{className:"page-btns",children:[t.jsx("button",{className:"page-btn",disabled:r===0,onClick:()=>x(s=>s-1),children:"‹"}),t.jsx("button",{className:"page-btn",disabled:(r+1)*y>=o,onClick:()=>x(s=>s+1),children:"›"})]})]})]})}export{X as default};
