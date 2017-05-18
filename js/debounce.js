install.patch(function() {

  return function(f, t = 100) {
    var timeout = null;
    return function(...args) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => f(...args), t);
    };
  }

})