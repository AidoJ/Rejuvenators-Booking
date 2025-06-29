// Rejuvenators Booking System v7 - Full Implementation (Block 1)

document.addEventListener('DOMContentLoaded', () => {
  // ----- State & Variables -----
  let currentStep = 'step1';
  let therapists = [];
  let availableTherapists = [];
  let currentLat = null;
  let currentLon = null;
  let selectedTherapist = null;

  // ----- Navigation & Progress -----
  function show(step) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(step).classList.add('active');
    currentStep = step;
    updateProgress(step);
  }
  function updateProgress(step) {
    const idx = parseInt(step.replace('step', ''), 10);
    document.querySelectorAll('.progress-step').forEach((el, i) => {
      el.classList.toggle('completed', i < idx - 1);
      el.classList.toggle('active', i === idx - 1);
    });
  }
  document.querySelectorAll('.next').forEach(btn => btn.onclick = () => show(btn.dataset.next));
  document.querySelectorAll('.prev').forEach(btn => btn.onclick = () => show(btn.dataset.prev));
  updateProgress('step1');

  // ----- Price Calculation -----
  function calculatePrice() {
    const base = 159;
    const dur = parseInt(document.getElementById('duration').value, 10);
    let price = base + ((dur - 60) / 15) * 35;
    const dateVal = document.getElementById('date').value;
    const timeVal = document.getElementById('time').value;
    if (dateVal && timeVal) {
      const dt = new Date(`${dateVal}T${timeVal}`);
      const weekend = [0, 6].includes(dt.getDay());
      const hour = dt.getHours();
      const afterHours = hour < 9 || hour >= 21;
      if (weekend) price *= 1.2;
      if (hour >= 16 && hour < 21) price *= 1.2;
      if (afterHours) price *= 1.3;
    }
    if (document.getElementById('parking').value !== 'free') price += 20;
    return price.toFixed(2);
  }
  function updatePriceDisplay() {
    const el = document.getElementById('priceAmount');
    if (el) el.textContent = calculatePrice();
  }
  ['duration','date','time','parking'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.addEventListener('change', updatePriceDisplay);
  });
  updatePriceDisplay();

  // ----- Geolocation & Mock Load -----
  function tryGeo() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => {
        currentLat = p.coords.latitude;
        currentLon = p.coords.longitude;
      });
    }
  }
  function loadMockTherapists() {
    fetch('mock-api/therapists.json')
      .then(r => r.json())
      .then(data => therapists = data);
  }
  tryGeo();
  loadMockTherapists();

  // ----- Address Autocomplete -----
  function loadGoogleMapsAPI() {
    const apiKey = 'AIzaSyBo632bfwdyKtue_-wkAms0Ac2mMRVnTWg';
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAutocomplete`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }
  
  function initAutocomplete() {
    if (!window.google || !google.maps || !google.maps.places) return;
    const inp = document.getElementById('address');
    if (!inp) return;
    
    try {
      const auto = new google.maps.places.Autocomplete(inp, { componentRestrictions: {country:'au'} });
      auto.addListener('place_changed', () => {
        const p = auto.getPlace();
        if (p.geometry && p.geometry.location) {
          currentLat = p.geometry.location.lat();
          currentLon = p.geometry.location.lng();
        }
      });
    } catch (e) {
      console.error('Autocomplete error:', e);
    }
  }
  window.initAutocomplete = initAutocomplete;

  // ----- Therapist Filtering & Selection -----
  function haversine(lat1,lon1,lat2,lon2) {
    const R = 6371;
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function filterTherapists() {
    if (currentLat==null||currentLon==null) return [];
    return therapists.filter(t=>{
      const d=haversine(currentLat,currentLon,t.lat,t.lon);
      return d<=10 && t.available;
    });
  }
  document.querySelector('.next[data-next="step4"]').onclick = () => {
    availableTherapists = filterTherapists();
    const selDiv = document.getElementById('therapistSelection');
    if (!availableTherapists.length) {
      selDiv.innerHTML = '<p>No therapists nearby.</p>';
      document.getElementById('requestBtn').disabled = true;
    } else {
      const sel = document.createElement('select'); sel.id='therapistSelect';
      availableTherapists.forEach(t=>{
        const opt = document.createElement('option');
        const d = haversine(currentLat,currentLon,t.lat,t.lon).toFixed(1);
        opt.value = JSON.stringify(t);
        opt.textContent = `${t.name} (${d} km)`;
        sel.appendChild(opt);
      });
      sel.onchange = ()=>{ selectedTherapist = JSON.parse(sel.value); };
      selDiv.innerHTML=''; selDiv.appendChild(sel);
      selectedTherapist = JSON.parse(sel.value);
      document.getElementById('requestBtn').disabled = false;
    }
    show('step4');
  };

  // ----- Booking Request Flow -----
  document.getElementById('requestBtn').onclick = () => {
    if (!selectedTherapist) return alert('Select a therapist');
    // compute price
    const price = calculatePrice();
    // email therapist
    emailjs.init('YOUR_EMAILJS_PUBLIC_KEY');
    emailjs.send('YOUR_SERVICE_ID','YOUR_TEMPLATE_ID',{
      to_name: selectedTherapist.name,
      to_email: 'aishizhenjing@gmail.com',
      message: `New booking for ${document.getElementById('service').value}, total $${price}`
    }).then(()=>console.log('Email sent')).catch(console.error);
    show('step5');
  };

  // ----- Simulate Accept/Decline -----
  document.getElementById('acceptBtn').onclick = () => {
    // go to payment, show price
    const price = calculatePrice();
    document.getElementById('summary').innerHTML = `<p><strong>Total: $${price}</strong></p>`;
    show('step6');
  };
  document.getElementById('declineBtn').onclick = () => {
    document.getElementById('finalMsg').textContent = 'Booking Declined';
    show('step7');
  };

  // ----- Payment -----
  let stripe, card;
  const payObserver = new MutationObserver(muts=>{
    muts.forEach(m=>{
      if (m.attributeName==='class' && m.target.classList.contains('active')) {
        if (m.target.id==='step6') {
          stripe = Stripe('pk_test_12345');
          const elems = stripe.elements();
          card = elems.create('card');
          document.getElementById('card-element').innerHTML='';
          card.mount('#card-element');
          document.getElementById('payBtn').disabled = true;
          card.on('change', e=>{
            const btn = document.getElementById('payBtn');
            btn.disabled = !e.complete; btn.style.opacity=e.complete?'1':'0.5';
          });
        }
      }
    });
  });
  payObserver.observe(document.getElementById('step6'), { attributes:true });

  document.getElementById('payBtn').onclick = () => {
    stripe.createToken(card).then(res=>{
      if (res.error) return alert(res.error.message);
      document.getElementById('finalMsg').textContent = 'Payment Successful! Booking Confirmed';
      show('step7');
    });
  };

  // ----- Init -----
  loadGoogleMapsAPI();
});