
// Autocomplete initialization
let autocomplete, current='step1', currentLat, currentLon, selectedTherapistInfo;
function initAutocomplete() {
  autocomplete = new google.maps.places.Autocomplete(
    document.getElementById('address'), { componentRestrictions:{country:'au'} }
  );
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    currentLat = place.geometry.location.lat();
    currentLon = place.geometry.location.lng();
  });
}
window.initAutocomplete = initAutocomplete;

// Navigation
function show(step) {
  document.querySelectorAll('.step').forEach(s=>s.classList.remove('active'));
  document.getElementById(step).classList.add('active');
  current=step;
}
document.querySelectorAll('.next').forEach(b=>b.onclick=()=>show(b.dataset.next));
document.querySelectorAll('.prev').forEach(b=>b.onclick=()=>show(b.dataset.prev));

// After datetime step to fetch therapists
document.querySelector('.next[data-next="step4"]').onclick=()=> {
  fetch('mock-api/therapists.json').then(r=>r.json()).then(data=>{
    const selDiv=document.getElementById('therapistSelection');
    selDiv.innerHTML='<select id="therapistSelect"></select>';
    const sel=document.getElementById('therapistSelect');
    data.forEach(t=>{
      const d = distance(currentLat, currentLon, t.lat, t.lon);
      if(d<=10 && t.available) {
        let opt=document.createElement('option');
        opt.value=JSON.stringify(t);
        opt.text=`${t.name} (${d.toFixed(1)} mi)`;
        sel.append(opt);
      }
    });
    show('step4');
  });
};

// Haversine distance
function distance(lat1,lon1,lat2,lon2){
  const R=3958.8, rLat1=lat1*Math.PI/180, rLat2=lat2*Math.PI/180;
  const dLat=rLat2-rLat1, dLon=(lon2-lon1)*Math.PI/180;
  return 2*R*Math.asin(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(rLat1)*Math.cos(rLat2)*Math.sin(dLon/2)**2));
}

// Booking request simulate
document.getElementById('requestBtn').onclick=()=>{
  const sel=document.getElementById('therapistSelect').value;
  selectedTherapistInfo=JSON.parse(sel);
  emailjs.init('V8qq2pjH8vfh3a6q3');
  emailjs.send('service_puww2kb','template_zh8jess',{
    to_name: selectedTherapistInfo.name,
    to_email: selectedTherapistInfo.email,
    message:'New booking request for '+document.getElementById('custName').value
  });
  show('step5');
};

// Accept/Decline simulation
document.getElementById('acceptBtn').onclick=()=>{
  show('step6');
};
document.getElementById('declineBtn').onclick=()=>{
  document.getElementById('finalMsg').innerText='Booking Request Declined';
  show('step7');
};

// Step6 summary and stripe setup
document.querySelector('.next[data-next="step6"]').onclick=()=>{
  const summary=document.getElementById('summary');
  const price=calculatePrice();
  summary.innerHTML=`<p><strong>Total Price: $${price}</strong></p>`;
  const stripe=Stripe('pk_test_12345'), elements=stripe.elements(), card=elements.create('card');
  document.getElementById('card-element').innerHTML=''; card.mount('#card-element');
  show('step6');
};

// Price calculation
function calculatePrice(){
  const base=159, dur=parseInt(document.getElementById('duration').value);
  let price=base+((dur-60)/15)*35;
  const dt=new Date(document.getElementById('date').value+'T'+document.getElementById('time').value);
  if([0,6].includes(dt.getDay())) price*=1.2;
  const hr=dt.getHours();
  if(hr>=16&&hr<21) price*=1.2; if(hr>=21||hr<9) price*=1.3;
  if(document.getElementById('parking').value!=='free') price+=20;
  return price.toFixed(2);
}

// Payment
document.getElementById('payBtn').onclick=()=>{
  const stripe=Stripe('pk_test_12345');
  stripe.createToken(document.querySelector('input[name="cardnumber"]')||card).then(res=>{
    if(res.error) return alert(res.error.message);
    document.getElementById('finalMsg').innerText='Payment Successful! Booking Confirmed';
    show('step7');
  });
};
