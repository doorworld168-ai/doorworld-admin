import{r as g,a as W,c as Z,j as e}from"./index-D0R9nWJe.js";import{s as R,p as B}from"./supabase-EwPXOdIy.js";import{a as O,g as Y,f as D,C as Q,e as G,P as k}from"./utils-CgBJMdzV.js";import{S as J}from"./StatCard-BcucnCwo.js";const v={nameZh:"門的世界 DOORWORLD",fullNameZh:"展億室內開發有限公司",taxId:"60667469",addr:"新北市五股區成泰路一段130-3號",phone:"02-2292-0366",email:"doorworld168@gmail.com"},K={single:"單開門",mother:"子母門",double:"雙開門",fire:"防火單門",room:"房間門",bathroom:"衛浴門",sliding:"橫拉門"};function c(t){return t?"NT$ "+Number(t).toLocaleString():"—"}function M(t){return(t?new Date(t):new Date).toLocaleDateString("zh-TW",{year:"numeric",month:"long",day:"numeric"})}function a(t){return String(t??"").replace(/[<>&"']/g,d=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"})[d])}async function V(t){if(!t){alert("找不到案件資料");return}const d=t.formal_quote_data||{};let n="";if(t.product_code)try{const o=await R(`products?full_code=eq.${encodeURIComponent(t.product_code)}&select=thumbnail_url,image_url`);n=o&&o[0]&&(o[0].thumbnail_url||o[0].image_url)||""}catch{}const w={};try{(await R("accessories?select=name,image_url&is_active=eq.true&image_url=not.is.null")||[]).forEach(s=>{s.image_url&&(w[s.name]=s.image_url)})}catch{}const x=d.fire_type==="f60a"?"f60A防火":d.fire_type==="f60a_smoke"?"f60A遮煙門":t.is_fireproof?"f60A防火":"不防火",b=K[t.door_type]||t.door_type||"單開門",p=M(t.official_quote_at||t.created_at),z=d.special_requirements||[],S=["拆舊","回收","佔框","濕式施工","乾式包框"].map(o=>(z.indexOf(o)>=0?"■":"□")+o).join(" ");let u="",$=0;t.addon_items&&t.addon_items.split(`
`).forEach(o=>{const s=o.trim();if(!s)return;let l=s.length-1;for(;l>=0&&(s[l]===" "||s.charCodeAt(l)>=48&&s.charCodeAt(l)<=57||s[l]===",");)l--;const _=l+1;if(_<s.length){const I=s.substring(_).trim().replace(/,/g,""),A=parseInt(I,10);if(!isNaN(A)){const H=s.substring(0,_).trim();$+=A,u+=`<tr><td class="tdl">${a(H)}</td><td class="tdv ra">${c(A)}</td></tr>`;return}}u+=`<tr><td class="tdl" colspan="2">${a(s)}</td></tr>`});let h=0;const m=t.quantity||1;if(t.official_note){const o=t.official_note.indexOf("門扇單價:");if(o!==-1){let s=o+5,l="";for(;s<t.official_note.length&&t.official_note.charCodeAt(s)>=48&&t.official_note.charCodeAt(s)<=57;)l+=t.official_note[s],s++;l&&(h=parseInt(l,10))}}!h&&t.official_price&&m>0&&(h=Math.round(t.official_price/m));const y=t.discount_rate||1,j=h*m,N=t.official_price||Math.round(j*y),i=t.install_fee||0,r=t.total_with_tax||N+$+i,C=t.deposit_50||Math.round(r*.5),F=t.balance||r-C,E=d.width_mm||(t.actual_width_cm?t.actual_width_cm*10:""),P=d.height_mm||(t.actual_height_cm?t.actual_height_cm*10:""),q=d.accessories||[],L=q.length===0?"":`
    <div style="margin-top:6px">
      <div style="font-size:8px;font-weight:700;letter-spacing:3px;color:#c9a227;text-transform:uppercase;padding:3px 10px;background:#1a1a1a;display:inline-block;margin-bottom:4px">五金配件</div>
      <table style="width:100%"><tr>
        ${q.map(o=>{const s=o.useUpgrade?o.upgrade:o.standard,l=o.useUpgrade?"#f9f6ec":"#fff",_=w[s]||w[o.standard]||"";return`<td style="border:1px solid #e2d5a0;padding:6px 8px;text-align:center;background:${l};vertical-align:top;width:${100/q.length}%">
            <div style="font-size:8px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:3px">${a(o.label)}</div>
            ${_?`<img src="${a(_)}" alt="" style="width:60px;height:60px;object-fit:contain;border:1px solid #e2d5a0;border-radius:3px;margin-bottom:3px">`:'<div style="width:60px;height:60px;display:inline-block"></div>'}
            <div style="font-size:9px;font-weight:600;line-height:1.3">${a(s||"—")}</div>
            ${o.useUpgrade?'<div style="font-size:7px;color:#c9a227;margin-top:1px;font-weight:700">選配</div>':'<div style="font-size:7px;color:#888;margin-top:1px">標配</div>'}
          </td>`}).join("")}
      </tr></table>
    </div>`,U=`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>${a(t.formal_quote_no||"報價單")}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm}
body{font-family:"Noto Sans TC",sans-serif;background:#fff;color:#1a1a1a;font-size:11px;line-height:1.5}
.page{width:210mm;min-height:297mm;padding:12mm 14mm 10mm;display:flex;flex-direction:column}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:8px;border-bottom:2.5px solid #c9a227;margin-bottom:8px}
.hdr-l{flex:1}
.hdr-r{text-align:right;font-size:10px;color:#555}
.doc-title{font-size:28px;font-weight:900;color:#1a1a1a;letter-spacing:2px}
.doc-sub{font-size:10px;font-weight:700;color:#c9a227;letter-spacing:4px;text-transform:uppercase;margin-top:2px}
.company-info{font-size:9px;color:#666;margin-top:4px;line-height:1.6}
.qno{font-size:15px;font-weight:900;color:#1a1a1a;letter-spacing:1px;margin-bottom:4px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d4af37;margin-bottom:8px}
.info-cell{padding:5px 10px;border-bottom:1px solid #e8ddb5;font-size:10px}
.info-cell:nth-child(odd){border-right:1px solid #e8ddb5}
.info-lbl{color:#999;font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}
.info-val{font-weight:600;color:#1a1a1a;margin-top:1px}
.stitle{font-size:8px;font-weight:700;letter-spacing:3px;color:#c9a227;text-transform:uppercase;padding:4px 10px;background:#1a1a1a;display:inline-block;margin-bottom:4px}
.sec{margin-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:2px}
.tdl{padding:4px 8px;background:#f9f6ec;color:#555;font-size:9px;font-weight:600;border:1px solid #e2d5a0;white-space:nowrap}
.tdv{padding:4px 8px;color:#1a1a1a;font-size:10px;border:1px solid #e2d5a0;word-break:break-word}
.ra{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.prod-tbl th{padding:4px 6px;background:#1a1a1a;color:#c9a227;font-size:8px;font-weight:700;letter-spacing:1px;border:1px solid #333;text-align:center}
.prod-tbl td{padding:4px 6px;border:1px solid #e2d5a0;text-align:center;font-size:10px}
.total-box{background:#1a1a1a;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:4px}
.total-lbl{font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a227;text-transform:uppercase}
.total-amt{font-size:24px;font-weight:900;color:#c9a227;font-variant-numeric:tabular-nums}
.pay-grid{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #d4af37;margin-top:4px}
.pay-cell{padding:6px 10px;text-align:center;border-right:1px solid #e8ddb5}
.pay-cell:last-child{border-right:none}
.pay-lbl{font-size:8px;color:#999;font-weight:700;letter-spacing:1px}
.pay-val{font-size:14px;font-weight:900;color:#1a1a1a;margin-top:2px;font-variant-numeric:tabular-nums}
.terms{font-size:7.5px;color:#666;line-height:1.5;column-count:2;column-gap:12px;margin-top:6px;padding:6px 8px;border:1px solid #e2d5a0;background:#fdfcf7}
.terms b{color:#333}
.foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:8px;border-top:1px solid #d4af37}
.seal{width:72px;height:72px;border-radius:50%;border:2px solid #c9a227;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#c9a227;text-align:center;line-height:1.3}
.sign-area{border:1px solid #d4af37;padding:8px 12px;min-width:200px;text-align:center}
.sign-lbl{font-size:8px;color:#999;letter-spacing:1px;margin-bottom:4px}
.sign-line{border-bottom:1px solid #ccc;height:40px}
.noprint{text-align:center;padding:10px;background:#1a1a1a;border-bottom:2px solid #c9a227}
.noprint button{background:#c9a227;color:#1a1a1a;border:none;padding:9px 28px;font-size:13px;font-weight:900;cursor:pointer;font-family:"Noto Sans TC",sans-serif;letter-spacing:2px}
@media print{.noprint{display:none}html,body{width:210mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{page-break-after:avoid}@page{margin:0;size:A4}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">列印 / 儲存 PDF</button></div>
<div class="page">
  <div class="hdr">
    <div class="hdr-l">
      <div class="doc-title">報價單</div>
      <div class="doc-sub">QUOTATION</div>
      <div class="company-info">
        甲方：${v.nameZh}（${v.fullNameZh}）　統編 ${v.taxId}<br>
        ${v.addr}　TEL: ${v.phone}　Email: ${v.email}
      </div>
    </div>
    <div class="hdr-r">
      <div class="qno">${a(t.formal_quote_no||t.order_no||t.case_no||"—")}</div>
      <div>日期：${p}</div>
      ${t.sales_person?`<div>業務：${a(t.sales_person)}</div>`:""}
      ${t.created_by?`<div>建單：${a(t.created_by)}</div>`:""}
    </div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><div class="info-lbl">乙方 / 聯絡人</div><div class="info-val">${a(t.customer_name||t.contact_person||"—")}</div></div>
    <div class="info-cell"><div class="info-lbl">統編</div><div class="info-val">${a(t.tax_id||"—")}</div></div>
    <div class="info-cell"><div class="info-lbl">電話</div><div class="info-val">${a(t.customer_phone||"—")}</div></div>
    <div class="info-cell"><div class="info-lbl">樓層 / 電梯</div><div class="info-val">${d.has_elevator===!1?"無電梯":"有電梯"}</div></div>
    <div class="info-cell" style="grid-column:span 2"><div class="info-lbl">案場地址</div><div class="info-val">${a(t.case_address||t.customer_addr||"—")}</div></div>
  </div>

  <div class="sec">
    <div class="stitle">報價明細</div>
    <div style="display:flex;gap:12px;align-items:flex-start">
      <table style="flex:1">
        <tr><td class="tdl">款式名稱</td><td class="tdv" style="font-weight:700">${a(t.product_code||"—")}</td>
            <td class="tdl">門的需求</td><td class="tdv">${a(b)}</td></tr>
        <tr><td class="tdl">防火需求</td><td class="tdv">${a(x)}</td>
            <td class="tdl">交貨時間</td><td class="tdv">${t.delivery_days||90} 日曆天</td></tr>
        <tr><td class="tdl">特殊需求</td><td class="tdv" colspan="3" style="font-size:9px">${z.length?S:"□無 "+S}</td></tr>
        <tr><td class="tdl">派送安裝</td><td class="tdv" colspan="3">${a(d.install_method||"甲方派送安裝")}</td></tr>
      </table>
      ${n?`<div style="flex-shrink:0;border:1px solid #e2d5a0;background:#fdfcf7;border-radius:4px;padding:6px;text-align:center"><img src="${a(n)}" alt="" style="width:150px;height:150px;object-fit:contain"><div style="font-size:7px;color:#999;margin-top:3px">效果圖僅供參考</div></div>`:""}
    </div>
  </div>

  <div class="sec">
    <div class="stitle">門框尺寸 / 產品規格</div>
    <table class="prod-tbl">
      <tr><th>門洞寬(W)</th><th>門洞高(H)</th><th>框厚</th><th>扇厚</th><th>門開方向</th><th>數量</th><th>藝術框</th><th>交貨方式</th><th>門扇顏色</th><th>門鎖樣式</th><th>門扇單價</th></tr>
      <tr>
        <td>${E?Math.round(E/10)+" cm":"—"}</td>
        <td>${P?Math.round(P/10)+" cm":"—"}</td>
        <td>${a(d.frame_thickness||"—")}</td>
        <td>${a(d.panel_thickness||"—")}</td>
        <td>${a(d.door_direction||"—")}</td>
        <td>${m}</td>
        <td>${a(d.art_frame||"無")}</td>
        <td>${a(d.delivery_type||"框扇同時")}</td>
        <td>${a(d.door_color||"—")}</td>
        <td>${a(d.lock_style||"—")}</td>
        <td style="font-weight:700">${c(h)}</td>
      </tr>
    </table>
    ${L}
    ${t.note?`<div style="margin-top:4px;font-size:9px;color:#555;padding:4px 8px;background:#f9f6ec;border:1px solid #e2d5a0">備註：${a(t.note)}</div>`:""}
  </div>

  <div class="sec">
    <div class="stitle">訂單金額</div>
    <table>
      <tr><td class="tdl">門扇費用 (${m}樘)</td><td class="tdv ra">${c(j)}</td></tr>
      ${y<1?`<tr><td class="tdl">折扣 (${Math.round(y*100)}%)</td><td class="tdv ra">${c(N)}</td></tr>`:""}
      ${i?`<tr><td class="tdl">安裝費</td><td class="tdv ra">${c(i)}</td></tr>`:""}
      ${u?`<tr><td class="tdl" colspan="2" style="background:#1a1a1a;color:#c9a227;font-size:8px;font-weight:700;letter-spacing:2px;text-align:left">附加施工費明細</td></tr>${u}`:""}
    </table>
    <div class="total-box">
      <div><div class="total-lbl">含稅總價</div></div>
      <div class="total-amt">${c(r)}</div>
    </div>
    <div class="pay-grid">
      <div class="pay-cell"><div class="pay-lbl">訂金 50%</div><div class="pay-val">${c(C)}</div></div>
      <div class="pay-cell"><div class="pay-lbl">尾款</div><div class="pay-val">${c(F)}</div></div>
      <div class="pay-cell"><div class="pay-lbl">含稅總價</div><div class="pay-val" style="color:#c9a227">${c(r)}</div></div>
    </div>
  </div>

  <div class="terms">
    <b>報價單注意事項：</b><br>
    1.下單時乙方先預付50%訂金，收訂金日視為下單日。<br>
    2.客製化產品下單後如要求改單，由下單日起算第3個日曆天下午1點後，改單所造成的損失由乙方承擔訂單總價之80%。<br>
    3.有品質問題時自驗收後5個工作天內經乙方提出，逾期甲方不再負責。<br>
    4.依客製化生產週期約在45~60個日曆天，如遇不可抗因素工期延長，甲方應提前20個工作天提出。<br>
    5.驗收日後7個日曆天前乙方必須付清尾款(50%)，交貨日起算30個日曆天後須離開甲方倉庫，超出時間收取倉儲費(總貨款3%/日曆天)。<br>
    6.出廠價格預設不含敲牆、拆舊回收、灌漿及選配零件等額外項目，如有需要以追加報價單核定為準。<br>
    7.通訊軟體及電話均屬溝通過程，所有內容以簽署報價單最終版本為準。<br>
    8.爭議時以臺灣新北市地方法院為第一審管轄法院。<br>
    9.乙方如無鎖具要求，一律依甲方標準鎖體開孔。<br>
    10.本交易為附條件買賣，貨款未付清前標的所有權屬甲方。<br>
    11.報價適用於上述條件與產品，如有特殊安裝需求可委託甲方丈量確認。<br>
    12.委請甲方丈量需先付訂金$3,000，可折抵訂單總價。<br>
    13.保固：門體非人為因素3年不變形保固；五金3年；安裝保固完工6個月。<br>
    14.保養請用抹布搭配清水，勿使用刺激性清潔產品。<br>
    15.提前付款開立暫收款憑證，待報價單確認後一併開立發票。<br>
    16.如有任何疑問，請即時聯絡業務人員。
  </div>

  <div class="foot">
    <div>
      <div style="font-size:12px;font-weight:900;color:#1a1a1a;margin-bottom:3px">${v.nameZh}</div>
      <div style="font-size:9px;color:#555">列印日期：${M(null)}</div>
    </div>
    <div class="sign-area">
      <div class="sign-lbl">客戶確認回傳（發票章 / 簽章 / 全名 / 日期）</div>
      <div class="sign-line"></div>
      <div style="font-size:7px;color:#999;margin-top:2px">已詳細核對上述訂購單注意事項，確保其正確性。</div>
    </div>
    <div class="seal">公司<br>印章</div>
  </div>
</div>
<script>window.onload=function(){
  var p=document.querySelector(".page");
  var maxH=297*3.7795;
  if(p.scrollHeight>maxH){
    var s=maxH/p.scrollHeight;
    p.style.transform="scale("+s+")";
    p.style.transformOrigin="top left";
    p.style.width=(210/s)+"mm";
  }
};<\/script>
</body></html>`,T=window.open("","_blank","width=820,height=1160");if(!T){alert("請允許彈出視窗以列印 PDF");return}T.document.write(U),T.document.close()}function at(){const[t,d]=g.useState([]),[n,w]=g.useState(0),[x,b]=g.useState(0),[p,z]=g.useState(""),[f,S]=g.useState("all"),[u,$]=g.useState(!0),h=W(),m=Z();async function y(){$(!0);let i="cases?select=*&order=created_at.desc";p&&(i+=`&or=(case_no.ilike.*${encodeURIComponent(p)}*,customer_name.ilike.*${encodeURIComponent(p)}*,order_no.ilike.*${encodeURIComponent(p)}*)`),f!=="all"&&(i+=`&status=eq.${f}`);try{w(await B(i.replace("select=*","select=id"))),d(await R(i+`&offset=${x*k}&limit=${k}`)||[])}catch(r){h(r.message,"error")}$(!1)}g.useEffect(()=>{y()},[p,f,x]);const j=x*k+1,N=Math.min(j+k-1,n);return e.jsxs("div",{children:[e.jsxs("div",{className:"page-header",children:[e.jsxs("div",{className:"page-title-wrap",children:[e.jsx("div",{className:"page-title",children:"報價單總表"}),e.jsx("div",{className:"page-subtitle",children:"所有正式報價單 — 追蹤報價 → 成案 → 付款 → 發包 → 完工"})]}),e.jsx("button",{className:"btn btn-primary",onClick:()=>m("/formalquote/new"),children:"+ 新增報價單"})]}),e.jsx("div",{className:"stats",children:e.jsx(J,{label:"總數",value:n})}),e.jsx("div",{style:{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"},children:[["all","全部"],["official_quoted","已報價"],["order_confirmed","已下單"],["deposit_paid","已付訂","var(--success)"],["production","製作中","#3b82f6"],["shipped","已出貨","#f59e0b"],["arrived","已到倉"],["installed","已安裝","var(--success)"],["completed","已結案","var(--success)"],["cancelled","已取消","var(--danger)"]].map(([i,r,C])=>e.jsx("button",{onClick:()=>{S(i),b(0)},style:{padding:"5px 11px",borderRadius:6,fontSize:12,cursor:"pointer",fontFamily:"var(--font-body)",border:`1px solid ${f===i?"var(--gold)":"var(--border)"}`,background:f===i?"var(--gold-dim)":"var(--surface-2)",color:f===i?C||"var(--gold)":"var(--text-muted)",fontWeight:f===i?700:500},children:r},i))}),e.jsxs("div",{style:{display:"flex",gap:8,marginBottom:14},children:[e.jsx("input",{className:"search-box",placeholder:"搜尋單號、客戶...",value:p,onChange:i=>{z(i.target.value),b(0)},style:{width:250}}),e.jsx("button",{className:"btn btn-ghost",onClick:y,children:"↻"})]}),e.jsx("div",{className:"table-wrap",children:e.jsxs("table",{children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"訂單編號"}),e.jsx("th",{children:"客戶"}),e.jsx("th",{children:"型態"}),e.jsx("th",{children:"業務"}),e.jsx("th",{children:"報價金額"}),e.jsx("th",{children:"總價"}),e.jsx("th",{children:"狀態"}),e.jsx("th",{children:"建立"}),e.jsx("th",{style:{width:50},children:"PDF"})]})}),e.jsx("tbody",{children:u?e.jsx("tr",{children:e.jsx("td",{colSpan:"9",children:e.jsxs("div",{className:"loading",children:[e.jsx("div",{className:"spinner"}),e.jsx("br",{}),"載入中..."]})})}):t.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:"9",children:e.jsxs("div",{className:"empty",children:[e.jsx("div",{className:"icon",children:"📋"}),"無資料"]})})}):t.map(i=>{const r=O[i.status]||O.new;return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("strong",{style:{fontFamily:"monospace",fontSize:11},children:i.order_no||i.case_no||"—"})}),e.jsx("td",{children:i.customer_name||"—"}),e.jsx("td",{style:{fontSize:11},children:Y[i.customer_type]||i.customer_type||"—"}),e.jsx("td",{style:{fontSize:12},children:i.sales_person||"—"}),e.jsx("td",{className:"price",children:D(i.official_price||i.quoted_price)}),e.jsx("td",{className:"price",children:D(i.total_with_tax)}),e.jsx("td",{children:e.jsx("span",{className:"badge",style:{background:r.bg,color:r.color},children:Q[i.status]||i.status})}),e.jsx("td",{style:{fontSize:12,color:"var(--text-muted)"},children:G(i.created_at)}),e.jsx("td",{children:e.jsx("button",{onClick:()=>V(i),title:"列印報價單 PDF",style:{background:"transparent",border:"1px solid var(--gold)",borderRadius:4,padding:"4px 9px",cursor:"pointer",color:"var(--gold)",fontSize:11,fontWeight:600},children:"PDF"})})]},i.id)})})]})}),e.jsxs("div",{className:"pagination",children:[e.jsx("span",{children:n?`${j}-${N} / ${n}`:""}),e.jsxs("div",{className:"page-btns",children:[e.jsx("button",{className:"page-btn",disabled:x===0,onClick:()=>b(i=>i-1),children:"‹"}),e.jsx("button",{className:"page-btn",disabled:(x+1)*k>=n,onClick:()=>b(i=>i+1),children:"›"})]})]})]})}export{at as default};
