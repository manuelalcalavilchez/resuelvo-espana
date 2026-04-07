document.addEventListener('DOMContentLoaded', () => {

  // ─── Photo Gallery ────────────────────────────────────────
  const thumbs = document.querySelectorAll('.photo-thumb');
  const mainPhoto = document.getElementById('main-photo');
  if (mainPhoto && thumbs.length) {
    thumbs.forEach(thumb => {
      thumb.addEventListener('click', () => {
        mainPhoto.src = thumb.dataset.full || thumb.src;
        thumbs.forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }

  // ─── Filter form auto-submit ───────────────────────────────
  document.querySelectorAll('.auto-submit-select').forEach(sel => {
    sel.addEventListener('change', () => sel.closest('form').submit());
  });

  // ─── Admin: confirm delete ─────────────────────────────────
  document.querySelectorAll('.confirm-delete').forEach(form => {
    form.addEventListener('submit', e => {
      if (!confirm('¿Estás seguro? Esta acción no se puede deshacer.')) e.preventDefault();
    });
  });

  // ─── Expiry date warning ───────────────────────────────────
  document.querySelectorAll('[data-expiry]').forEach(el => {
    const expiry = new Date(el.dataset.expiry);
    const today = new Date();
    const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (diff <= 1) el.classList.add('text-danger');
    else if (diff <= 7) el.classList.add('text-warning');
  });

  // ─── Image lazy loading ────────────────────────────────────
  if ('IntersectionObserver' in window) {
    const imgs = document.querySelectorAll('img[data-src]');
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          obs.unobserve(img);
        }
      });
    });
    imgs.forEach(img => io.observe(img));
  }

  // ─── Smooth profile card hover effect ─────────────────────
  document.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 8;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 8;
      card.style.transform = `perspective(600px) rotateY(${x}deg) rotateX(${-y}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // ─── Premium Movement & Visibility ────────────────────────
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes premium-glow {
      0% { box-shadow: 0 0 5px rgba(212, 175, 55, 0.2); transform: scale(1); }
      50% { box-shadow: 0 0 20px rgba(212, 175, 55, 0.5); transform: scale(1.02); }
      100% { box-shadow: 0 0 5px rgba(212, 175, 55, 0.2); transform: scale(1); }
    }
    .premium-active { animation: premium-glow 3s infinite ease-in-out; border: 1px solid #d4af37 !important; }

    /* Estilos mejorados para Login y Registro */
    .auth-container { 
      display: flex; justify-content: center; align-items: center; min-height: 90vh; padding: 20px;
      background: radial-gradient(circle at center, #1a1a1a 0%, #000 100%);
    }
    .auth-card { 
      background: rgba(26, 26, 26, 0.95); padding: 45px; border-radius: 20px; 
      box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 15px rgba(212, 175, 55, 0.1); 
      width: 100%; max-width: 420px; border: 1px solid rgba(212, 175, 55, 0.3);
      backdrop-filter: blur(10px);
    }
    .auth-card h2 { 
      color: #d4af37; text-align: center; margin-bottom: 35px; font-family: 'Playfair Display', serif; 
      text-transform: uppercase; letter-spacing: 3px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }
    .form-group { margin-bottom: 25px; }
    .form-group label { display: block; color: #d4af37; margin-bottom: 10px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
    .form-group input, .form-group select { 
      width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #333; 
      background: rgba(11, 11, 11, 0.8); color: #fff; outline: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
    }
    .form-group input:focus { border-color: #d4af37; background: #000; box-shadow: 0 0 10px rgba(212, 175, 55, 0.2); transform: translateY(-1px); }
    .btn-auth { 
      width: 100%; padding: 16px; background: linear-gradient(135deg, #d4af37, #aa892f); border: none; 
      border-radius: 10px; color: #000; font-weight: 800; cursor: pointer; transition: all 0.3s ease; 
      margin-top: 15px; text-transform: uppercase; letter-spacing: 1.5px;
    }
    .btn-auth:hover { transform: translateY(-3px); box-shadow: 0 8px 25px rgba(212,175,55,0.5); filter: brightness(1.1); }
    .auth-links { text-align: center; margin-top: 30px; font-size: 0.9rem; border-top: 1px solid #333; padding-top: 25px; color: #888; }
    .auth-links a { color: #d4af37; text-decoration: none; font-weight: bold; transition: 0.3s; }
    .auth-links a:hover { color: #fff; text-shadow: 0 0 8px rgba(212,175,55,0.6); }
    .error-msg { background: rgba(220, 53, 69, 0.1); color: #ff4d4d; padding: 12px; border-radius: 8px; border: 1px solid rgba(220, 53, 69, 0.3); margin-bottom: 20px; text-align: center; font-size: 0.85rem; }
    
    /* Indicador de usuario en Nav */
    .nav-user-info { color: #d4af37; font-weight: bold; display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
    .nav-user-info span { color: #fff; font-weight: normal; }
  `;
  document.head.appendChild(style);

  // Aplicar movimiento sutil a tarjetas Premium/Destacadas
  const premiums = document.querySelectorAll('.profile-card.premium, .profile-card.destacada');
  premiums.forEach(card => {
    card.classList.add('premium-active');
  });

  // ─── Control de Disponibilidad (AJAX) ──────────────────────
  document.querySelectorAll('.availability-toggle').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';

      try {
        await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) });
        window.location.reload(); // Recarga para actualizar traducciones y estado
      } catch (err) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  });

});
