



function onLoadPage() {
  $('._loader').addClass('--loaded')
}

$(document).ready(function() {
  // hide loader; reveal page
  window.setTimeout(onLoadPage, 400)
});


$(window).load(function() {
  $('._size-vheight').each(function() {
    // calculate vh manually, and set it dynamically
    // console.log($(this).data())
    var height = $(window).height() * ($(this).data('vheight') * 0.01);
    $(this).css({'height': height})
  });
});

