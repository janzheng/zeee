/*

  todo:
    - fix anchor links, esp. for citations
      - check external links?
      - maybe as part of the citation builder?
    - images need to be fixed
    - add a ?data=[data]
      - useful for paywalled services; hooked up w/ the bookmarklet
      * need POST data; can't use URL to pass huge data packets

  done:
    - scrape for DOI and add citations 
    - ignored: support both http and https
    - resolve anchor and hashtags by rewriting them
    - resolve image and other local refs
    - add separate html ?html=true to return html, otherwise return json obj
    - package data w/
      - domain
      - uri
      - DOI
      - referenceList (super hard and not worth my time for now)
      - sections (e.g. methods, discussion)
        - create custom anchor links like id="discussions", "materials-and-methods"
      - citations
        - multiple styles found on google scholar auto generated
        - https://crosscite.org/format?doi=10.3389/fmicb.2016.01024&style=apa&lang=en-US
        

    - run requests like: 
      - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/paperstrip?url=https://www.frontiersin.org/articles/10.3389/fmicb.2016.01024/full
      - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/paperstrip?html=true&url=https://www.frontiersin.org/articles/10.3389/fmicb.2016.01024/full
*/

_ = require('lodash');
url = require('url');
http = require('http');
https = require('https');
r = require('readability-node');
jsdom = require('jsdom').jsdom;
$ = require('jquery');


var writeArticle = function( res, article ) {
  res.write(
    "<html><head><meta charset='utf-8'><title>"
    + article.title
    + "</title></head><body>"
    + article.content
    + "</body></html>"); 
}

var metaParse = function (property, rules) {
  var obj = {value: '(best value)', els: []}
  // console.log('Finding:', property)
  for (var rule of rules) {
    // console.log('rule:', rule[0])
    $(rule[0]).each(function() {
      // console.log('parser:', this)
      obj.els.push({
        el: this,
        data: rule[1](this)
      })
    })
  }
  
  // get the first one found
  if(obj.els.length > 0) {
    obj.value = obj.els[0].data
    obj[property] = obj.els[0].data
  } else {
    obj.value = undefined
    obj[property] = undefined
  }
  return obj.value
}

// parse object to string and write the respose
var writeJSON = function( res, obj ) {
  var objJSON;
  // is an object 
  // yes: parse to a string
  // if not, set it to empty object
  if(typeof(obj) === 'object') {
    objJSON = JSON.stringify(obj);
  } else {
    objJSON = '{}';
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write( objJSON );
};


var getCitations = function(doi) {
  return new Promise((resolve) => {
    // this only works for crosscite dois
    // https://crosscite.org/format?doi=10.3389/fmicb.2016.01024&style=apa&lang=en-US
    var apa = $.get( `https://crosscite.org/format?doi=${doi}&style=apa&lang=en-US`);
    var harvard = $.get( `https://crosscite.org/format?doi=${doi}&style=elsevier-harvard2&lang=en-US`);
    var mla = $.get( `https://crosscite.org/format?doi=${doi}&style=modern-language-association&lang=en-US`);
    var chicago = $.get( `https://crosscite.org/format?doi=${doi}&style=chicago-fullnote-bibliography&lang=en-US`);
    $.when(apa, harvard, mla, chicago).done(function(d1) {
      resolve({
        apa: apa,
        harvard: harvard,
        mla: mla,
        chicago: chicago
      })
    });
  });
}

var getPaper = function(ctx) {
  return new Promise((resolve, reject) => {
    
    var uri = ctx.query.url;
    // console.log('url', req.url, 'uri', uri);
    uri = uri ? uri : e => (res.write('add a ?url= !'));

    // get the article and metadata
    https.get(uri, function(_res){
      var src = '';
      _res.on('error', function(e){ reject(e) });
      _res.on('data', function(d){ src += d; });
      _res.on('end', function(){
        
        var paper = {};
        
        var doc = jsdom(src, {features: {
          FetchExternalResources: false,
          ProcessExternalResources: false
        }});
        $ = require('jquery')(doc.parentWindow); // initialize jquery
        
        
        paper['domain'] = metaParse("domain", [
                  [`[name="twitter:domain"]`, node => $(node).attr('content')],
                ], doc) || url.parse(uri).host;

        paper['uri'] = metaParse("domain", [
                  [`[name="twitter:domain"]`, node => $(node).attr('content')],
                ], doc) || uri;
                
        paper['doi'] = metaParse("DOI", [
            [`[name="citation_doi"]`, node => $(node).attr('content')],
            [`[name="DC.Identifier"]`, node => $(node).attr('content')],
          ]);
        
        // add section identifiers (MUTATES THE DOC!)
        $('h1, h2, h3, h4, h5, h6').each(function(data){
          var ref = _.kebabCase($(this).text());
          $(this).attr('id',ref)
        });
        
        // render article after all other transformation
        paper['article'] = new r.Readability(uri, doc).parse();
        
        // add sections for parsed article
        paper['sections'] = [];
        $($.parseHTML(paper.article.content)).find('h1, h2, h3, h4, h5, h6').each(function(data){
          var section = {
            title: $(this).text(),
            ref: $(this).attr('id')
          }
          paper.sections.push(section);
        });
        
        resolve(paper);
      });
      
      // get the citations
        
    });
      
  });
}

var finish = function(res, ctx, paper) {
  console.log('finishing up')
  if(ctx.query.html == 'true') {
    console.log('html')
    res.writeHead(200, { 'Content-Type': 'text/html' });
    writeArticle(res, paper.article);
  } else {
    console.log('json')
    res.writeHead(200, { 'Content-Type': 'application/json' });
    writeJSON(res, paper);
  }
  console.log('finish__')
  res.end();
}

module.exports = 
  function (ctx, req, res) {
    
    if(req.method == 'GET') {
      
      getPaper(ctx)
        .then(function(paper){
          if(paper.doi) {
              console.log('getting citations...')
            getCitations(paper.doi).then(function(citations) {
              paper['citations'] = citations
              finish(res, ctx, paper);
            })
          } else {
            finish(res, ctx, paper)
          }
          
        })
        
    }

    // res.end();
  };
