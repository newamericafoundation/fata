$(function() {
var demographics = $('.demographics');
if (!demographics.size()) return;

$('a', demographics).click(function() {
  var facet = $(this).attr('href').split('#').pop().toLowerCase();
  var template = _('<%=pct%>% &mdash; <%=num%> respondents').template();

  // TODO: handle no data message.
  $('.graph').each(function() {
    _.defer(_(function() {
      var total = 0;
      $('a:not(.fill)', this).each(function() {
        total += parseInt($(this).data()[facet] || 0, 10);
      });

      if (total === 0) {
        $('.empty', this).removeClass('hidden');
      } else {
        $('.empty', this).addClass('hidden');
      }

      $('a:not(.fill)', this).each(function() {
        var val = parseInt($(this).data()[facet] || 0, 10);
        var values = {
          pct: (Math.floor(1000 * val / total) * 0.1).toFixed(1),
          num: val
        };
        $(this).css({width: values.pct + '%'});
        $('i', this).html(template(values));
      });
    }).bind(this));
  });

  $('a.active', demographics).removeClass('active');
  $(this).addClass('active');
  return false;
});

var filterPosition = demographics.offset().top;
$(window).bind('scroll', function(e) {
  var scroll = (document.documentElement.scrollTop || document.body.scrollTop);
  if (scroll > filterPosition) {
    $('body').addClass('fix-filters');
  } else {
    $('body').removeClass('fix-filters');
  }
});

});