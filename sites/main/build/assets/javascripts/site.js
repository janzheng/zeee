

function setTopOpacity(val) {
  $('.top').css({opacity: 0.7 - Math.min(val,0.5)})
}

function eee() {
  var _top = $(window).scrollTop(), 
      _windowH = $(window).outerHeight(), 
      _windowW = $(window).outerWidth(), 
      _height = $('body').outerHeight(), 
      _percH = _top/(_height-_windowH),
      _ew = 45,
      _percW = _windowW/_ew,
      _ceil = Math.ceil(_percH * _percW) - 3, //adjust for 'zeee' logo 
      _e = '<span>e</span>',
      _eee = ''
      _t = 'eee'

  var i=1;
  while (i <= (_ceil)) {
    _eee+=_e
    _t+='e'
    i++
  }
  $('#eee').html(_eee)
  document.title=_t

  setTopOpacity(_percH)
}

function onLoadPage() {
  $('._loader').addClass('--loaded')
}

$(document).ready(function() {
  // hide loader; reveal page
  window.setTimeout(onLoadPage, 400)
  $(window).on('scroll', _.throttle(eee, 30));
});

$('._expander').on('click', function() {
  $(this).toggleClass('--open');
});

$(document).ready(function() { 
  // intercept hash on load
  var hash = location.hash,
      navOffset = -60;

  verticalScroll(navOffset);
  eee();
});








