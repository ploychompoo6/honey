/* ==========================================================
   Honey Bloom — shared script (ใช้ร่วมกันทุกหน้า)
   - product.html : แสดงสินค้า + กรองตาม mood
   - order.html   : เติมชื่อสินค้า/ราคาจาก URL และส่งออเดอร์
   - admin.html   : แสดงรายการสั่งซื้อจาก Google Sheet (CSV)
   แต่ละส่วนจะทำงานเฉพาะเมื่อหน้านั้นมี element ที่ต้องการ
   ========================================================== */

(function () {
  'use strict';

  var PRODUCTS_URL = 'products.json';
  var ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyRQ7H6ShPrvVIqZGKnRaxfPdg2IwMuqHaf2xQoxdQHRR0ymdgX9EVWkjWHl0zdlg1-Ww/exec';
  var ORDERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRs9HlNBoOdBhlKmvfOqRuV6lCa1RxhjJo7yQejo_Jj9GKj-xKQn0HQtXRclYsZPcH1Q1-M2WMcvZCa/pub?gid=0&single=true&output=csv';

  var MOODS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'fresh', label: 'Fresh' },
    { key: 'sweet', label: 'Sweet' },
    { key: 'golden', label: 'Golden' },
    { key: 'premium', label: 'Premium' }
  ];

  /* ---------- helpers ---------- */

  // สร้าง element แบบปลอดภัย (ใช้ textContent ไม่ใช้ innerHTML)
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatNumber(value) {
    var n = Number(String(value).replace(/,/g, ''));
    if (value === '' || isNaN(n)) return value;
    return n.toLocaleString('th-TH');
  }

  /* ==========================================================
     1) product.html
     ========================================================== */

  function initProducts() {
    var filterBar = document.getElementById('filter-bar');
    var list = document.getElementById('product-list');
    if (!filterBar || !list) return;

    var products = [];
    var params = new URLSearchParams(window.location.search);
    var requested = (params.get('mood') || 'all').toLowerCase();
    var current = MOODS.some(function (m) { return m.key === requested; }) ? requested : 'all';

    function buildFilters() {
      filterBar.textContent = '';
      MOODS.forEach(function (m) {
        var btn = el('button', 'filter', m.label);
        btn.type = 'button';
        btn.setAttribute('data-mood', m.key);
        btn.addEventListener('click', function () {
          setMood(m.key);
        });
        filterBar.appendChild(btn);
      });
      updateActive();
    }

    function updateActive() {
      var buttons = filterBar.querySelectorAll('.filter');
      Array.prototype.forEach.call(buttons, function (btn) {
        var active = btn.getAttribute('data-mood') === current;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function setMood(key) {
      current = key;
      updateActive();
      render();
      // อัปเดต URL ให้แชร์ลิงก์ที่กรองแล้วได้
      try {
        var url = new URL(window.location.href);
        if (key === 'all') url.searchParams.delete('mood');
        else url.searchParams.set('mood', key);
        window.history.replaceState(null, '', url);
      } catch (e) { /* ไม่เป็นไรถ้าอัปเดต URL ไม่ได้ */ }
    }

    function buildCard(p) {
      var item = p.name + ' ' + p.size;
      var orderUrl = 'order.html?item=' + encodeURIComponent(item) +
        '&price=' + encodeURIComponent(p.price);

      var card = el('article', 'product-card');
      card.setAttribute('data-mood', p.mood);

      var media = el('div', 'product-card__media');
      var img = document.createElement('img');
      img.src = p.image;
      img.alt = item;
      img.loading = 'lazy';
      media.appendChild(img);

      var body = el('div', 'product-card__body');
      body.appendChild(el('div', 'mood-mark'));
      body.appendChild(el('h3', 'product-card__title', p.name));
      body.appendChild(el('p', 'product-card__size', p.size));

      var foot = el('div', 'product-card__foot');
      var price = el('span', 'price', formatNumber(p.price));
      price.appendChild(el('small', null, 'บาท'));
      var buy = el('a', 'btn btn--gold', 'สั่งซื้อ');
      buy.href = orderUrl;
      foot.appendChild(price);
      foot.appendChild(buy);

      body.appendChild(foot);
      card.appendChild(media);
      card.appendChild(body);
      return card;
    }

    function render() {
      list.textContent = '';
      var shown = products.filter(function (p) {
        return current === 'all' || p.mood === current;
      });
      if (!shown.length) {
        list.appendChild(el('p', 'muted', 'ยังไม่มีสินค้าในหมวดนี้'));
        return;
      }
      shown.forEach(function (p) {
        list.appendChild(buildCard(p));
      });
    }

    buildFilters();

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        render();
      })
      .catch(function (error) {
        console.error(error);
        list.textContent = '';
        list.appendChild(el('p', 'muted', 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณารีเฟรชหน้านี้อีกครั้ง'));
      });
  }

  /* ==========================================================
     2) order.html
     ========================================================== */

  function initOrder() {
    var form = document.getElementById('orderForm');
    if (!form) return;

    var itemsField = document.getElementById('items');
    var totalField = document.getElementById('total');

    // เติมชื่อสินค้าและราคาจาก URL ทันทีที่โหลดหน้า
    var params = new URLSearchParams(window.location.search);
    var item = params.get('item');
    var price = params.get('price');
    if (itemsField && item !== null) itemsField.value = item;
    if (totalField && price !== null) totalField.value = price;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var payload = {
        customerName: document.getElementById('customerName').value.trim(),
        contact: document.getElementById('contact').value.trim(),
        items: document.getElementById('items').value.trim(),
        total: document.getElementById('total').value.trim(),
        note: document.getElementById('note').value.trim()
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        if (submitBtn) submitBtn.disabled = false;
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      });
    });
  }

  /* ==========================================================
     3) admin.html
     ========================================================== */

  // แปลง CSV เป็น array ของแถว (รองรับ "ข้อความใน quote", "" แทน ", และขึ้นบรรทัดใหม่ใน quote)
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // ตัด BOM

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }

    // แถวสุดท้ายที่ไม่มี newline ปิดท้าย
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    // ตัดแถวว่างทิ้ง
    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ''; });
    });
  }

  function initAdmin() {
    var tbody = document.querySelector('#ordersTable tbody');
    if (!tbody) return;

    function showMessage(message) {
      tbody.textContent = '';
      var tr = document.createElement('tr');
      var td = el('td', 'muted', message);
      td.colSpan = 6;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage('กำลังโหลดข้อมูล...');

    fetch(ORDERS_CSV_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        rows.shift(); // แถวแรกคือหัวคอลัมน์

        if (!rows.length) {
          showMessage('ยังไม่มีรายการสั่งซื้อ');
          return;
        }

        // ชีตเพิ่มแถวใหม่ไว้ล่างสุดเสมอ จึงกลับลำดับให้รายการล่าสุดขึ้นก่อน
        rows.reverse();

        tbody.textContent = '';
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          // ลำดับคอลัมน์: วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ
          for (var i = 0; i < 6; i++) {
            var value = r[i] === undefined ? '' : r[i];
            tr.appendChild(el('td', null, i === 4 ? formatNumber(value) : value));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        showMessage('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้านี้อีกครั้ง');
      });
  }

  /* ---------- start ---------- */

  function init() {
    initProducts();
    initOrder();
    initAdmin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
