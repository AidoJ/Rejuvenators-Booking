// Autocomplete initialization
let autocomplete, current='step1', currentLat, currentLon, selectedTherapistInfo;

// Initialize EmailJS
function initEmailJS() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init('V8qq2pjH8vfh3a6q3');
    console.log('EmailJS initialized successfully');
  } else {
    console.log('EmailJS not loaded');
  }
}

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

// Price display update
function updatePriceDisplay() {
  const priceElement = document.getElementById('priceAmount');
  if (priceElement) {
    const price = calculatePrice();
    priceElement.textContent = price;
  }
}

// Add event listeners for price updates
document.addEventListener('DOMContentLoaded', function() {
  // Initialize EmailJS
  initEmailJS();
  
  // Test EmailJS functionality
  setTimeout(() => {
    if (typeof emailjs !== 'undefined') {
      console.log('Testing EmailJS...');
      // Simple test email
      emailjs.send('service_puww2kb','template_zh8jess', {
        to_name: 'Test',
        to_email: 'aidanleo@yahoo.co.uk',
        message: 'This is a test email from the booking system',
        customer_name: 'Test Customer',
        customer_email: 'test@example.com',
        customer_phone: '123-456-7890',
        booking_details: 'Test booking details'
      }).then((response) => {
        console.log('Test email sent successfully:', response);
      }).catch(err => {
        console.error('Test email failed:', err);
      });
    }
  }, 2000);
  
  const durationSelect = document.getElementById('duration');
  const parkingSelect = document.getElementById('parking');
  const dateInput = document.getElementById('date');
  const timeSelect = document.getElementById('time');
  
  if (durationSelect) {
    durationSelect.addEventListener('change', updatePriceDisplay);
  }
  if (parkingSelect) {
    parkingSelect.addEventListener('change', updatePriceDisplay);
  }
  if (dateInput) {
    dateInput.addEventListener('change', updatePriceDisplay);
  }
  if (timeSelect) {
    timeSelect.addEventListener('change', updatePriceDisplay);
  }
  
  // Initial price calculation
  updatePriceDisplay();
  
  // Handle URL parameters for accept/decline functionality
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  const bookingData = urlParams.get('booking');
  
  if (action && bookingData) {
    try {
      const booking = JSON.parse(decodeURIComponent(bookingData));
      if (action === 'accept') {
        // Show acceptance message and proceed to payment
        document.getElementById('requestMsg').innerText = 'Booking Accepted! Proceeding to payment...';
        show('step6');
        // Auto-proceed to payment after a short delay
        setTimeout(() => {
          show('step7');
        }, 2000);
      } else if (action === 'decline') {
        // Show decline message
        document.getElementById('finalMsg').innerText = 'Booking Request Declined';
        show('step8');
      }
    } catch (e) {
      console.error('Error parsing booking data:', e);
    }
  }
  
  // After datetime step to fetch therapists
  const nextToStep5Btn = document.querySelector('.next[data-next="step5"]');
  if (nextToStep5Btn) {
    nextToStep5Btn.onclick = () => {
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
        show('step5');
      });
    };
  }
  
  // Step7 summary and stripe setup - this should trigger when entering step 7
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const step7 = document.getElementById('step7');
        if (step7 && step7.classList.contains('active')) {
          // Step 7 is now active, update summary and setup Stripe
          const summary = document.getElementById('summary');
          const price = calculatePrice();
          const customerName = document.getElementById('customerName').value;
          const customerEmail = document.getElementById('customerEmail').value;
          const customerPhone = document.getElementById('customerPhone').value;
          
          summary.innerHTML = `
            <h3>Booking Summary</h3>
            <p><strong>Customer:</strong> ${customerName}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Phone:</strong> ${customerPhone}</p>
            <p><strong>Service:</strong> ${document.getElementById('service').value}</p>
            <p><strong>Duration:</strong> ${document.getElementById('duration').value} min</p>
            <p><strong>Date:</strong> ${document.getElementById('date').value}</p>
            <p><strong>Time:</strong> ${document.getElementById('time').value}</p>
            <p><strong>Total Price: $${price}</strong></p>
          `;
          
          // Initialize Stripe
          if (typeof Stripe !== 'undefined') {
            const stripe = Stripe('pk_test_12345');
            const elements = stripe.elements();
            const card = elements.create('card');
            document.getElementById('card-element').innerHTML = ''; 
            card.mount('#card-element');
          }
        }
      }
    });
  });
  
  // Start observing
  observer.observe(document.getElementById('step7'), {
    attributes: true,
    attributeFilter: ['class']
  });
  
  // Test email button
  const testEmailBtn = document.getElementById('testEmailBtn');
  if (testEmailBtn) {
    testEmailBtn.onclick = () => {
      console.log('Test email button clicked');
      if (typeof emailjs !== 'undefined') {
        emailjs.send('service_puww2kb','template_zh8jess', {
          to_name: 'Test User',
          to_email: 'aidanleo@yahoo.co.uk',
          message: 'This is a test email from the booking system - ' + new Date().toLocaleString(),
          customer_name: 'Test Customer',
          customer_email: 'test@example.com',
          customer_phone: '123-456-7890',
          booking_details: 'Test booking details - ' + new Date().toLocaleString()
        }).then((response) => {
          console.log('Test email sent successfully:', response);
          alert('Test email sent successfully! Check console for details.');
        }).catch(err => {
          console.error('Test email failed:', err);
          alert('Test email failed: ' + err.text);
        });
      } else {
        alert('EmailJS not loaded!');
      }
    };
  }
});

// Haversine distance
function distance(lat1,lon1,lat2,lon2){
  const R=3958.8, rLat1=lat1*Math.PI/180, rLat2=lat2*Math.PI/180;
  const dLat=rLat2-rLat1, dLon=(lon2-lon1)*Math.PI/180;
  return 2*R*Math.asin(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(rLat1)*Math.cos(rLat2)*Math.sin(dLon/2)**2));
}

// Booking request simulate
document.getElementById('requestBtn').onclick = () => {
  // 1. Calculate price
  const price = calculatePrice();

  // 2. Build a comprehensive summary for the email
  const customerName = document.getElementById('customerName').value;
  const customerEmail = document.getElementById('customerEmail').value;
  const customerPhone = document.getElementById('customerPhone').value;
  const address = document.getElementById('address').value;
  
  const summaryText =
    `NEW BOOKING REQUEST\n\n` +
    `Customer Details:\n` +
    `Name: ${customerName}\n` +
    `Email: ${customerEmail}\n` +
    `Phone: ${customerPhone}\n\n` +
    `Booking Details:\n` +
    `Address: ${address}\n` +
    `Service: ${document.getElementById('service').value}\n` +
    `Duration: ${document.getElementById('duration').value} min\n` +
    `Date: ${document.getElementById('date').value}\n` +
    `Time: ${document.getElementById('time').value}\n` +
    `Parking: ${document.getElementById('parking').value}\n` +
    `Total Price: $${price}\n\n` +
    `To accept this booking, click: ${window.location.origin}${window.location.pathname}?action=accept&booking=${encodeURIComponent(JSON.stringify({
      customerName, customerEmail, customerPhone, address,
      service: document.getElementById('service').value,
      duration: document.getElementById('duration').value,
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      parking: document.getElementById('parking').value,
      price: price
    }))}\n\n` +
    `To decline this booking, click: ${window.location.origin}${window.location.pathname}?action=decline&booking=${encodeURIComponent(JSON.stringify({
      customerName, customerEmail, customerPhone, address,
      service: document.getElementById('service').value,
      duration: document.getElementById('duration').value,
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      parking: document.getElementById('parking').value,
      price: price
    }))}`;

  // 3. Grab the selected therapist
  const sel = document.getElementById('therapistSelect').value;
  selectedTherapistInfo = JSON.parse(sel);

  // 4. Send email to Jane's test address
  // Note: You need to configure EmailJS with your actual credentials:
  // 1. Sign up at https://www.emailjs.com/
  // 2. Create an email service (Gmail, Outlook, etc.)
  // 3. Create an email template
  // 4. Replace the placeholder values below with your actual EmailJS credentials
  
  // For testing purposes, we'll simulate the email sending
  console.log('Sending email to:', 'aidanleo@yahoo.co.uk');
  console.log('Email content:', summaryText);
  
  // Try to send via EmailJS if configured, otherwise simulate success
  if (typeof emailjs !== 'undefined' && emailjs.init) {
    console.log('EmailJS is available, attempting to send email...');
    emailjs.send('service_puww2kb','template_zh8jess', {
      to_name: selectedTherapistInfo.name,
      to_email: 'aidanleo@yahoo.co.uk', // Updated email address
      message: summaryText,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      booking_details: summaryText
    }).then((response) => {
      console.log('EmailJS success response:', response);
      document.getElementById('requestMsg').innerText = 'Request sent! Waiting for therapist response…';
      show('step6');
    }).catch(err => {
      console.error('EmailJS error details:', err);
      console.error('EmailJS error text:', err.text);
      console.error('EmailJS error status:', err.status);
      // Fallback: simulate success for testing
      document.getElementById('requestMsg').innerText = 'Request sent! Waiting for therapist response…';
      show('step6');
    });
  } else {
    console.log('EmailJS not available, simulating email send...');
    // EmailJS not configured, simulate success
    document.getElementById('requestMsg').innerText = 'Request sent! Waiting for therapist response…';
    show('step6');
  }
};

// Accept/Decline simulation
document.getElementById('acceptBtn').onclick=()=>{
  show('step7');
};
document.getElementById('declineBtn').onclick=()=>{
  document.getElementById('finalMsg').innerText='Booking Request Declined';
  show('step8');
};

// Price calculation
function calculatePrice(){
  const base=159, dur=parseInt(document.getElementById('duration').value);
  let price=base+((dur-60)/15)*35;
  let breakdown = [`Base: $${base}`];
  
  if (dur > 60) {
    const durationSurcharge = ((dur-60)/15)*35;
    breakdown.push(`Duration (${dur}min): +$${durationSurcharge.toFixed(2)}`);
  }
  
  // Only apply date/time surcharges if date and time are selected
  const dateValue = document.getElementById('date').value;
  const timeValue = document.getElementById('time').value;
  
  if (dateValue && timeValue) {
    const dt=new Date(dateValue+'T'+timeValue);
    if([0,6].includes(dt.getDay())) {
      price*=1.2; // Weekend surcharge
      breakdown.push('Weekend: +20%');
    }
    const hr=dt.getHours();
    if(hr>=16&&hr<21) {
      price*=1.2; // Peak hours (4-9 PM)
      breakdown.push('Peak hours: +20%');
    }
    if(hr>=21||hr<9) {
      price*=1.3; // Late night/early morning (9 PM-9 AM)
      breakdown.push('Late night: +30%');
    }
  }
  
  if(document.getElementById('parking').value!=='free') {
    price+=20;
    breakdown.push('Parking: +$20');
  }
  
  // Update breakdown display
  const breakdownElement = document.getElementById('priceBreakdown');
  if (breakdownElement) {
    breakdownElement.innerHTML = breakdown.join('<br>');
  }
  
  return price.toFixed(2);
}

// Payment
document.getElementById('payBtn').onclick=()=>{
  if (typeof Stripe !== 'undefined') {
    const stripe=Stripe('pk_test_12345');
    const cardElement = document.querySelector('#card-element .StripeElement');
    if (cardElement) {
      stripe.createToken(cardElement).then(res=>{
        if(res.error) {
          alert(res.error.message);
          return;
        }
        document.getElementById('finalMsg').innerText='Payment Successful! Booking Confirmed';
        show('step8');
      });
    } else {
      // Simulate successful payment for testing
      document.getElementById('finalMsg').innerText='Payment Successful! Booking Confirmed';
      show('step8');
    }
  } else {
    // Stripe not loaded, simulate success
    document.getElementById('finalMsg').innerText='Payment Successful! Booking Confirmed';
    show('step8');
  }
};