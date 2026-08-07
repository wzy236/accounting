(function () {
  var CATEGORIES = window.__CATEGORIES__ || [];

  function populateCategorySelect(categorySelect, type, currentId) {
    var options = CATEGORIES.filter(function (c) {
      return c.type === type;
    });
    categorySelect.innerHTML = '';
    var noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '未分类';
    categorySelect.appendChild(noneOpt);
    options.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (String(c.id) === String(currentId)) opt.selected = true;
      categorySelect.appendChild(opt);
    });
  }

  function findGroup(el) {
    return el.closest('tr') || el.closest('.tx-form-row') || el.parentElement;
  }

  function syncGroup(typeSelect) {
    var group = findGroup(typeSelect);
    if (!group) return;
    var categorySelect = group.querySelector('.category-select');
    if (!categorySelect) return;
    var currentId = categorySelect.dataset.current || '';
    populateCategorySelect(categorySelect, typeSelect.value, currentId);
  }

  document.querySelectorAll('.type-select').forEach(function (typeSelect) {
    syncGroup(typeSelect);
    typeSelect.addEventListener('change', function () {
      var group = findGroup(typeSelect);
      var categorySelect = group && group.querySelector('.category-select');
      if (categorySelect) categorySelect.dataset.current = '';
      syncGroup(typeSelect);
    });
  });
})();
