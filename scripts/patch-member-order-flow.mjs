import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(ROOT, 'MemberPortal.html');
let s = fs.readFileSync(file, 'utf8');

const oldStart = '      var memPk = {';
const oldEnd = '      function initMemPickup()';
const i = s.indexOf(oldStart);
const j = s.indexOf(oldEnd, i);
if (i < 0 || j < 0) throw new Error('memPk block not found');

const replacement = `      var memPk = { menu: [], loaded: false, wired: false };
      function pkNormMenu(raw) {
        return (raw || []).map(function (m) {
          return {
            id: m.id,
            name: m.name,
            category: m.category || '',
            image: String(m.imageUrl || m.coverImageUrl || m.image || '').trim(),
            price: m.basePrice != null ? Number(m.basePrice) : (Number(m.price) || 0),
            available: m.available !== false
          };
        });
      }
      function syncMemPkUi() {
        if (window.MemOrder && MemOrder.syncNavBadge) MemOrder.syncNavBadge();
      }
      function buildMemOrderCardHtml(m) {
        var src = (m.imageUrl && String(m.imageUrl).trim()) ? esc(m.imageUrl) : menuCardPlaceholderImg();
        var img = '<img src="' + src + '" alt="" loading="lazy" decoding="async">';
        var label = buildMenuLabelHtml(m);
        var badgeWrap = label ? '<div class="menu-card-badges">' + label + '</div>' : '';
        var price = m.basePrice != null ? m.basePrice : m.price;
        return '<div class="img">' + img + badgeWrap + '</div>' +
          '<div class="bd mem-pk-bd"><div class="nm">' + esc(m.name) + '</div>' +
          '<div class="mem-pk-footer"><div class="pr">' + fmt(price || 0) + '</div>' +
          '<button type="button" class="mem-pk-add-btn" data-add-id="' + escAttr(m.id) + '" aria-label="Thêm ' + escAttr(m.name) + '">' +
          '<i class="fa-solid fa-plus"></i></button></div></div>';
      }
      function openMemProductFromCard(id, full) {
        var attempts = 0;
        function tryOpen() {
          if (!window.MemOrder) return false;
          if (full && MemOrder.openProduct) { MemOrder.openProduct(full); return true; }
          if (MemOrder.openProductByIdOrFetch) {
            MemOrder.openProductByIdOrFetch(id).then(function (ok) {
              if (!ok) showToast('Không tìm thấy món. Thử tải lại trang.');
            }).catch(function () { showToast('Không tải được thực đơn'); });
            return true;
          }
          if (MemOrder.openProductById && MemOrder.openProductById(id)) return true;
          return false;
        }
        if (tryOpen()) return;
        if (window.MemOrder && MemOrder.bootstrap) MemOrder.bootstrap();
        (function retry() {
          attempts += 1;
          if (tryOpen()) return;
          if (attempts < 30) setTimeout(retry, Math.min(120, attempts * 40));
          else showToast('Chưa sẵn sàng đặt hàng — tải lại trang hoặc thử lại sau vài giây.');
        })();
      }
      function memPkQuickAdd(id, full) {
        if (!window.MemOrder) { openMemProductFromCard(id, full); return; }
        var p = full || (state.menu || []).find(function (x) { return String(x.id) === String(id); });
        if (p && MemOrder.quickAddProduct) {
          MemOrder.quickAddProduct(p);
          syncMemPkUi();
          return;
        }
        openMemProductFromCard(id, full);
      }
      function memPkDrawGrid(cat) {
        var grid = $('pk-grid');
        if (!grid) return;
        var norm = window.MemOrder && MemOrder.normalizeCategory ? MemOrder.normalizeCategory.bind(MemOrder) : function (c) { return String(c || '').trim(); };
        var list = cat === 'all' ? memPk.menu : memPk.menu.filter(function (m) { return norm(m.category) === cat; });
        var items = list.filter(function (m) { return m.available !== false; });
        grid.innerHTML = items.length ? items.map(function (m) {
          var full = (state.menu || []).find(function (x) { return String(x.id) === String(m.id); });
          var card = full || {
            id: m.id, name: m.name,
            imageUrl: m.image || m.imageUrl || '',
            basePrice: m.price != null ? m.price : m.basePrice,
            available: m.available !== false
          };
          return '<article class="pk-card menu-card portal-menu-pro" data-id="' + escAttr(m.id) + '">' + buildMemOrderCardHtml(card) + '</article>';
        }).join('') : '<p style="color:var(--text3);font-size:13px;">Chưa có món.</p>';
        grid.querySelectorAll('.pk-card').forEach(function (card) {
          card.onclick = function (e) {
            if (e.target.closest('.mem-pk-add-btn')) return;
            var id = card.getAttribute('data-id');
            var full = (state.menu || []).find(function (x) { return String(x.id) === String(id); });
            openMemProductFromCard(id, full);
          };
        });
        grid.querySelectorAll('.mem-pk-add-btn').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-add-id');
            var full = (state.menu || []).find(function (x) { return String(x.id) === String(id); });
            memPkQuickAdd(id, full);
          };
        });
      }
      function renderMemPkMenu() {
        var catsEl = $('pk-cats');
        if (!catsEl) return;
        var cats = ['all'].concat((window.MemOrder && MemOrder.categoryList) ? MemOrder.categoryList() : ['Sữa hạt', 'Mix hạt', 'Coffee', 'Topping', 'Matcha', 'Trà trái cây']);
        catsEl.innerHTML = cats.map(function (c) {
          return '<button type="button" data-c="' + escAttr(c) + '"' + (c === 'all' ? ' class="on"' : '') + '>' + (c === 'all' ? 'Tất cả' : esc(c)) + '</button>';
        }).join('');
        catsEl.querySelectorAll('button').forEach(function (btn) {
          btn.onclick = function () {
            catsEl.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
            btn.classList.add('on');
            memPkDrawGrid(btn.getAttribute('data-c'));
          };
        });
        memPkDrawGrid('all');
      }
      function wireMemPickupOnce() {
        if (memPk.wired) return;
        memPk.wired = true;
      }
      `;

s = s.slice(0, i) + replacement + s.slice(j);

const oldInit = /function initMemPickup\(\) \{[\s\S]*?\n      \}\n      function goPickupSmooth/;
const newInit = `function initMemPickup() {
        if (!state.phone && !state.guest) return;
        if (window.MemOrder && MemOrder.bootstrap) MemOrder.bootstrap();
        wireMemPickupOnce();
        var greet = $('mem-pk-greet');
        if (state.guest && greet) {
          greet.textContent = 'Xin chào ' + (state.guest.name || 'bạn') + ' — chọn món rồi bấm Hoàn tất trong Giỏ nhé';
        } else if (state.portal && state.portal.profile && greet) {
          var p = state.portal.profile;
          greet.textContent = 'Xin chào ' + (p.name || state.phone) + (p.memberCode ? ' · Mã ' + p.memberCode : '');
        }
        function afterMenuReady() {
          syncMemPkUi();
          if (window.MemOrder && MemOrder.consumePendingPromo) MemOrder.consumePendingPromo();
        }
        if (memPk.loaded && memPk.menu.length) {
          afterMenuReady();
          return;
        }
        if (state.menu && state.menu.length) {
          memPk.menu = pkNormMenu(state.menu);
          memPk.loaded = true;
          syncMenuCache();
          renderMemPkMenu();
          afterMenuReady();
          return;
        }
        var grid = $('pk-grid');
        if (grid) grid.innerHTML = '<p style="color:var(--text3);font-size:13px;">Đang tải thực đơn…</p>';
        api('getMenu').then(function (raw) {
          state.menu = raw || [];
          memPk.menu = pkNormMenu(state.menu);
          memPk.loaded = true;
          syncMenuCache();
          renderMemPkMenu();
          afterMenuReady();
        }).catch(function () {
          if (grid) grid.innerHTML = '<p style="color:var(--red);font-size:13px;">Không tải được thực đơn</p>';
        });
      }
      function goPickupSmooth`;

if (!oldInit.test(s)) throw new Error('initMemPickup not found');
s = s.replace(oldInit, newInit);

fs.writeFileSync(file, s, 'utf8');
console.log('Patched MemberPortal.html — memPk now uses MemOrder cart only');
