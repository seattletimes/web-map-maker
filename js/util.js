install.patch(function() {

  return {
    commafy: s => s.toLocaleString().replace(/\.0+$/, "")
  }

});