/* dc-lite: renderiza las paginas exportadas de Claude Design (.dc.html) con React.
   Soporta {{holes}}, <template data-if>, <template data-for>, eventos, refs y <helmet>. */
(function () {
  'use strict';
  var h = React.createElement;
  var ATTR = {
    'class': 'className', 'for': 'htmlFor', onclick: 'onClick', onsubmit: 'onSubmit', oninput: 'onInput',
    onchange: 'onChange', onfocus: 'onFocus', onblur: 'onBlur', onkeydown: 'onKeyDown', onkeyup: 'onKeyUp',
    onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave', autoplay: 'autoPlay', playsinline: 'playsInline',
    novalidate: 'noValidate', maxlength: 'maxLength', minlength: 'minLength', inputmode: 'inputMode',
    autocomplete: 'autoComplete', tabindex: 'tabIndex', readonly: 'readOnly', checked: 'defaultChecked',
    crossorigin: 'crossOrigin', colspan: 'colSpan', rowspan: 'rowSpan', srcset: 'srcSet', enterkeyhint: 'enterKeyHint'
  };
  var BOOL = { autoPlay: 1, playsInline: 1, noValidate: 1, muted: 1, loop: 1, required: 1, defaultChecked: 1,
    readOnly: 1, disabled: 1, controls: 1, multiple: 1, selected: 1, hidden: 1, open: 1 };
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var HOLE = /\{\{([^}]*)\}\}/g;
  var WHOLE = /^\s*\{\{([^}]*)\}\}\s*$/;

  function lookup(scope, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return +path;
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var v = scope, ks = path.split('.');
    for (var i = 0; i < ks.length; i++) { if (v == null) return undefined; v = v[ks[i]]; }
    return v;
  }
  function str(v) { return v == null || v === false ? '' : String(v); }
  function interp(s, scope) { return s.replace(HOLE, function (_, p) { return str(lookup(scope, p)); }); }
  function val(s, scope) {
    if (s == null) return undefined;
    var m = WHOLE.exec(s);
    if (m) return lookup(scope, m[1]);
    return s.indexOf('{{') >= 0 ? interp(s, scope) : s;
  }
  function parseStyle(s) {
    var o = {}, parts = [], cur = '', depth = 0, q = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { if (c === q) q = ''; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      if (c === ';' && !q && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    parts.forEach(function (p) {
      var i = p.indexOf(':'); if (i < 0) return;
      var k = p.slice(0, i).trim(), v = p.slice(i + 1).trim(); if (!k) return;
      if (k.indexOf('--') !== 0) k = k.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      o[k] = v;
    });
    return o;
  }

  function kids(parent, scope) {
    var out = [], n = parent.firstChild, i = 0;
    for (; n; n = n.nextSibling) {
      var r = conv(n, scope, i++);
      if (r !== null && r !== undefined && r !== '') out.push(r);
    }
    return out;
  }

  function conv(node, scope, key) {
    if (node.nodeType === 3) {
      var t = node.nodeValue;
      if (t.indexOf('{{') < 0) return t;
      var m = WHOLE.exec(t);
      if (m) { var v = lookup(scope, m[1]); return (v != null && typeof v === 'object' && v.$$typeof) ? v : str(v); }
      return interp(t, scope);
    }
    if (node.nodeType !== 1) return null;
    var tag = node.localName;
    if (tag === 'template') {
      if (node.hasAttribute('data-if')) {
        return val(node.getAttribute('value'), scope) ? h(React.Fragment, { key: key }, kids(node.content, scope)) : null;
      }
      if (node.hasAttribute('data-for')) {
        var list = val(node.getAttribute('list'), scope) || [];
        var as = node.getAttribute('as') || 'item';
        return h(React.Fragment, { key: key }, list.map(function (it, i) {
          var s = Object.create(scope); s[as] = it; s.$index = i;
          return h(React.Fragment, { key: i }, kids(node.content, s));
        }));
      }
      return null;
    }
    var props = { key: key }, isSvg = node.namespaceURI === 'http://www.w3.org/2000/svg';
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a], name = at.name;
      if (name.indexOf('hint-') === 0) continue;
      var pv = val(at.value, scope);
      if (name === 'style') { props.style = typeof pv === 'string' ? parseStyle(pv) : pv; continue; }
      if (name === 'value' && (tag === 'textarea' || tag === 'select' ||
          (tag === 'input' && !/^(radio|checkbox|submit|button)$/i.test(node.getAttribute('type') || '')))) { props.defaultValue = pv; continue; }
      var pn = isSvg ? (name === 'class' ? 'className' : name) : (ATTR[name] || name);
      if (BOOL[pn] && typeof pv === 'string') pv = pv !== 'false';
      props[pn] = pv;
    }
    if (VOID[tag]) return h(tag, props);
    return h.apply(null, [tag, props].concat(kids(node, scope)));
  }

  var TEMPLATE = null;
  class DCLogic extends React.Component {
    renderVals() { return {}; }
    render() {
      var scope = Object.assign(Object.create(null), this.renderVals());
      return h(React.Fragment, null, kids(TEMPLATE.content, scope));
    }
  }
  window.DCLogic = DCLogic;

  function boot() {
    TEMPLATE = document.getElementById('dc');
    var helmet = TEMPLATE.content.querySelector('helmet');
    if (helmet) {
      while (helmet.firstChild) document.head.appendChild(document.importNode(helmet.firstChild, true)), helmet.removeChild(helmet.firstChild);
      helmet.parentNode.removeChild(helmet);
    }
    var sc = document.querySelector('script[data-dc-script]');
    var props = {};
    try {
      var meta = JSON.parse(sc.getAttribute('data-props') || '{}');
      Object.keys(meta).forEach(function (k) { if (k[0] !== '$' && meta[k] && 'default' in meta[k]) props[k] = meta[k]['default']; });
    } catch (e) {}
    var Component = new Function('DCLogic', 'React', sc.textContent + '\n;return Component;')(DCLogic, React);
    var root = document.createElement('div');
    root.id = 'app';
    TEMPLATE.parentNode.insertBefore(root, TEMPLATE);
    ReactDOM.createRoot(root).render(h(Component, props));
    if (location.hash) setTimeout(function () { var el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
