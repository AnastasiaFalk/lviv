import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET } from "./config.js";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const categoryNames = {food:"Заклад харчування",shop:"Магазин",culture:"Культура",health:"Медицина",public:"Громадський простір",other:"Інше"};

async function loadPlaces(){
 const target=document.querySelector("#places"); if(!target)return;
 const msg=document.querySelector("#message");
 const {data,error}=await supabase.from("places").select("*").order("created_at",{ascending:false});
 if(error){msg.textContent="Не вдалося завантажити каталог. Перевірте налаштування Supabase.";console.error(error);return;}
 let activeStatus="";
 const render=()=>{
  const q=document.querySelector("#search").value.trim().toLocaleLowerCase("uk");
  const cat=document.querySelector("#category").value;
  const rows=data.filter(p=>(`${p.name} ${p.address}`).toLocaleLowerCase("uk").includes(q)&&(!activeStatus||p.status===activeStatus)&&(!cat||p.category===cat));
  target.innerHTML=rows.map(p=>{
   const photo=p.photo_path?supabase.storage.from(STORAGE_BUCKET).getPublicUrl(p.photo_path).data.publicUrl:"";
   return `<article class="place-card"><div class="place-image-wrap">${photo?`<img class="place-image" src="${esc(photo)}" alt="${esc(p.photo_alt)}" loading="lazy">`:`<div class="photo-placeholder">⌖</div>`}<span class="status-pill ${p.status==="accessible"?"status-positive":"status-negative"}">${p.status==="accessible"?"✓ Вдале рішення":"! Невдале рішення"}</span></div><div class="place-content">${p.category?`<p class="category-label">${esc(categoryNames[p.category]||p.category)}</p>`:""}<h3>${esc(p.name)}</h3><p class="place-description">${esc(p.description)}</p><div class="place-address">⌖ <span>${esc(p.address)}</span></div>${p.maps_url?`<a class="map-link" href="${esc(p.maps_url)}" target="_blank" rel="noopener noreferrer">Відкрити на карті ↗</a>`:""}</div></article>`;
  }).join("");
  msg.innerHTML=rows.length?`Знайдено прикладів: <strong>${rows.length}</strong>`:`<div class="empty-state"><span class="empty-icon">⌕</span><h3>${data.length?"Нічого не знайдено":"Каталог поки порожній"}</h3><p>${data.length?"Спробуйте змінити пошук або фільтри.":"Додайте перший приклад доступності у Львові."}</p></div>`;
 };
 document.querySelector("#search").addEventListener("input",render);
 document.querySelector("#category").addEventListener("change",render);
 document.querySelectorAll(".filter-tab").forEach(b=>b.addEventListener("click",()=>{activeStatus=b.dataset.status;document.querySelectorAll(".filter-tab").forEach(x=>x.classList.toggle("active",x===b));render();}));
 render();
}
function setupForm(){
 const form=document.querySelector("#place-form");if(!form)return;
 const desc=form.querySelector('[name="description"]');
 desc.addEventListener("input",()=>document.querySelector("#description-count").textContent=`${desc.value.length}/3000`);
 form.querySelector('[name="photo"]').addEventListener("change",e=>document.querySelector("#file-name").textContent=e.target.files[0]?.name||"Оберіть фотографію");
 form.querySelectorAll('input[name="status"]').forEach(r=>r.addEventListener("change",()=>form.querySelectorAll(".choice-card").forEach(c=>c.classList.toggle("selected",c.querySelector("input").checked))));
 form.addEventListener("submit",async e=>{
  e.preventDefault();const msg=document.querySelector("#form-message"),btn=form.querySelector("button[type=submit]"),v=new FormData(form),file=v.get("photo");
  if(!(file instanceof File)||!file.size){msg.textContent="Додайте фото.";return;}
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024){msg.textContent="Фото має бути JPG, PNG або WebP до 5 МБ.";return;}
  btn.disabled=true;msg.textContent="Надсилаємо ваш приклад…";let path;
  try{
   path=`${crypto.randomUUID()}.${({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[file.type]}`;
   const {error:up}=await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:file.type});if(up)throw up;
   const record={name:v.get("name").trim(),status:v.get("status"),address:v.get("address").trim(),description:v.get("description").trim(),category:v.get("category")||null,maps_url:v.get("maps_url")||null,photo_path:path,photo_alt:v.get("photo_alt").trim()};
   const {error}=await supabase.from("places").insert(record);if(error){await supabase.storage.from(STORAGE_BUCKET).remove([path]);throw error;}
   form.reset();document.querySelector("#file-name").textContent="Оберіть фотографію";document.querySelector("#description-count").textContent="0/3000";form.querySelectorAll(".choice-card").forEach(c=>c.classList.remove("selected"));msg.textContent="Дякуємо! Приклад успішно додано до каталогу ❤️";
  }catch(err){console.error(err);msg.textContent=`Не вдалося надіслати: ${err.message||"невідома помилка"}`;}
  finally{btn.disabled=false;}
 });
}
loadPlaces();setupForm();
