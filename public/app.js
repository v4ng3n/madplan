const state={plan:null,checked:{},activeRecipe:0,poll:null,lastChecklistSignature:""};

const $=(selector)=>document.querySelector(selector);

function escapeHtml(value=""){
  return String(value).replace(/[&<>'"]/g,(char)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
  })[char]);
}

function setSync(text,kind=""){
  const el=$("#syncStatus");
  el.textContent=text;
  el.className=("sync "+kind).trim();
}

async function loadPlan(){
  const response=await fetch("/data/madplan.json",{cache:"no-store"});
  if(!response.ok) throw new Error("Kunne ikke hente madplanen");
  state.plan=await response.json();
  $("#weekLabel").textContent=state.plan.label||state.plan.week;
  renderAll();
}

async function loadChecklist(silent=false){
  if(!state.plan) return;
  try{
    const response=await fetch("/api/checklist?week="+encodeURIComponent(state.plan.week),{cache:"no-store"});
    if(!response.ok) throw new Error("Checklist API failed");
    const data=await response.json();
    const next=data.checked||{};
    const signature=JSON.stringify(next);
    if(signature!==state.lastChecklistSignature){
      state.checked=next;
      state.lastChecklistSignature=signature;
      renderShopping();
    }
    setSync("Synkroniseret","ok");
  }catch(error){
    if(!silent) setSync("Offline","error");
  }
}

async function setChecked(itemId,checked){
  state.checked[itemId]=checked;
  state.lastChecklistSignature=JSON.stringify(state.checked);
  renderShopping();
  setSync("Gemmer…");
  try{
    const response=await fetch("/api/checklist",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({week:state.plan.week,itemId:itemId,checked:checked})
    });
    if(!response.ok) throw new Error("Save failed");
    setSync("Synkroniseret","ok");
  }catch(error){
    setSync("Kunne ikke gemme","error");
    await loadChecklist(true);
  }
}

function showView(name){
  document.querySelectorAll(".tab").forEach((button)=>{
    button.classList.toggle("active",button.dataset.view===name);
  });
  document.querySelectorAll(".view").forEach((view)=>view.classList.remove("active"));
  $("#"+name+"View").classList.add("active");
}

function openRecipe(index){
  state.activeRecipe=index;
  showView("recipes");
  renderRecipes();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderWeek(){
  const grid=$("#weekGrid");
  grid.innerHTML="";
  const template=$("#dayCardTemplate");
  const recipes=state.plan.days.filter((day)=>day.recipe);

  for(const day of state.plan.days){
    const node=template.content.cloneNode(true);
    node.querySelector(".day-name").textContent=day.day;
    node.querySelector(".dish-name").textContent=day.dish;
    node.querySelector(".badge").textContent=day.type==="leftovers"?"Rester":"Lav mad";
    node.querySelector(".offer").textContent=day.offer||"Ingen særlig tilbudsvare";

    const button=node.querySelector(".recipe-link");
    const recipeIndex=recipes.indexOf(day);
    if(recipeIndex<0){
      button.classList.add("hidden");
    }else{
      button.addEventListener("click",()=>openRecipe(recipeIndex));
    }
    grid.appendChild(node);
  }
}

function renderShopping(){
  if(!state.plan) return;
  const root=$("#shoppingList");
  root.innerHTML="";
  let total=0;
  let done=0;

  for(const group of state.plan.shopping||[]){
    const section=document.createElement("section");
    section.className="shop-group";
    const heading=document.createElement("h3");
    heading.textContent=group.store;
    section.appendChild(heading);

    for(const item of group.items){
      total++;
      if(state.checked[item.id]) done++;

      const label=document.createElement("label");
      label.className="shop-item"+(state.checked[item.id]?" checked":"");

      const checkbox=document.createElement("input");
      checkbox.type="checkbox";
      checkbox.checked=Boolean(state.checked[item.id]);
      checkbox.addEventListener("change",()=>setChecked(item.id,checkbox.checked));

      const text=document.createElement("span");
      text.className="item-text";

      const main=document.createElement("span");
      main.className="item-main";
      main.textContent=(item.amount?item.amount+" · ":"")+item.name;
      text.appendChild(main);

      if(item.note){
        const note=document.createElement("small");
        note.className="item-note";
        note.textContent=item.note;
        text.appendChild(note);
      }

      label.append(checkbox,text);
      section.appendChild(label);
    }
    root.appendChild(section);
  }

  $("#shoppingProgress").textContent=total
    ? done+" af "+total+" varer krydset af"
    : "Ingen varer endnu";
}

function renderRecipes(){
  const tabs=$("#recipeTabs");
  tabs.innerHTML="";
  const recipes=state.plan.days.filter((day)=>day.recipe);

  if(!recipes.length){
    $("#recipeCard").innerHTML='<div class="empty">Ingen opskrifter endnu.</div>';
    return;
  }

  state.activeRecipe=Math.min(state.activeRecipe,recipes.length-1);

  recipes.forEach((day,index)=>{
    const button=document.createElement("button");
    button.className="recipe-tab"+(index===state.activeRecipe?" active":"");
    button.textContent=day.day;
    button.type="button";
    button.setAttribute("role","tab");
    button.setAttribute("aria-selected",index===state.activeRecipe?"true":"false");
    button.addEventListener("click",()=>{
      state.activeRecipe=index;
      renderRecipes();
    });
    tabs.appendChild(button);
  });

  const day=recipes[state.activeRecipe];
  const recipe=day.recipe;
  let html="";
  html+='<p class="day-name">'+escapeHtml(day.day)+'</p>';
  html+='<h3>'+escapeHtml(day.dish)+'</h3>';
  html+='<p class="muted">'+escapeHtml(recipe.servings||"")+'</p>';
  if(recipe.childNote){
    html+='<div class="callout"><strong>Til barnet:</strong> '+escapeHtml(recipe.childNote)+'</div>';
  }
  html+='<h4>Ingredienser</h4><ul>';
  html+=(recipe.ingredients||[]).map((item)=>'<li>'+escapeHtml(item)+'</li>').join("");
  html+='</ul><h4>Sådan gør du</h4><ol>';
  html+=(recipe.steps||[]).map((step)=>'<li>'+escapeHtml(step)+'</li>').join("");
  html+='</ol>';
  if(recipe.leftovers){
    html+='<div class="callout"><strong>Gem til senere:</strong> '+escapeHtml(recipe.leftovers)+'</div>';
  }
  $("#recipeCard").innerHTML=html;
}

function renderAll(){
  renderWeek();
  renderShopping();
  renderRecipes();
}

$(".tabs").addEventListener("click",(event)=>{
  const button=event.target.closest(".tab");
  if(button) showView(button.dataset.view);
});

$("#clearChecked").addEventListener("click",async()=>{
  if(!state.plan) return;
  if(!confirm("Vil du fjerne alle afkrydsninger på ugens indkøbsliste?")) return;

  setSync("Nulstiller…");
  try{
    const response=await fetch("/api/checklist",{
      method:"DELETE",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({week:state.plan.week})
    });
    if(!response.ok) throw new Error("Reset failed");
    state.checked={};
    state.lastChecklistSignature="{}";
    renderShopping();
    setSync("Synkroniseret","ok");
  }catch(error){
    setSync("Kunne ikke nulstille","error");
  }
});

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") loadChecklist(true);
});

(async()=>{
  try{
    await loadPlan();
    await loadChecklist();
    state.poll=setInterval(()=>loadChecklist(true),2000);
  }catch(error){
    setSync("Kunne ikke hente data","error");
    $("#weekGrid").innerHTML='<div class="empty">'+escapeHtml(error.message)+'</div>';
  }
})();