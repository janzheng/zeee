// https://medium.freecodecamp.org/create-a-simple-rest-api-endpoint-using-webtask-io-d9607fc00c17
// https://gist.github.com/yagop/9448103fbad9213c1b0799d5412de086
// https://doaj.org/api/v1/search/journals/frontiers%20in%20microbiology

// moved over to the node8 account at https://sandbox.auth0-extend.com/edit/wt-ece6cabd401b68e3fc2743969a9c99f0-0#webtaskName=whatnode&token=eyJhbGciOiJIUzI1NiIsImtpZCI6IjIifQ.eyJqdGkiOiI4YzY4ZDJmMjYwMDU0NTNkYjY0NGEyMzIwY2JhMDdiZCIsImlhdCI6MTUyMjEyOTQwOCwiY2EiOlsiOTAwNzMzNGRiMDhjNGQ2M2E0MTNjZGFmM2YzYjYxNGMiXSwiZGQiOjEsInRlbiI6Ii9ed3QtZWNlNmNhYmQ0MDFiNjhlM2ZjMjc0Mzk2OWE5Yzk5ZjAtWzAtMV0kLyJ9.ymHJbNAlOM849Ue7iutsM9q54cM6yoPC0kE48ljaWg8
const _ = require('lodash');
url = require('url');
// http = require('http');
https = require('https');

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
}

function meta() {
  return {
    message: "This API returns a list of journals and publishers as described on the “Beall’s List of Predatory Journals and Publishers” found at https://beallslist.weebly.com/. You can also add a search query: [link]?search=frontiers%20in%20microbiology to get a filtered set of results. Adding a query will also return a list of matches against DOAJ’s database. This API does not make any assumptions or conclusions about the data found on the list, it merely provides API wrapper for the data. This code is an unlicensed, unsolicited mirror of the data, and does not make any warranties around the validity or the accuracy of the data. To make better decisions about the predatory nature of a journal, please visit https://thinkchecksubmit.org. For a more up-to-date service, check out Cabell’s List (https://www2.cabells.com/). ",
    dateUpdated: Date("March 19, 2018")
  }
}

function getFiltered(source, query) {
  return source.filter((el) => {
    if(el.name !==undefined) {
      if (
        el.name.toLowerCase().includes(query.toLowerCase()) ||
        el.note.toLowerCase().includes(query.toLowerCase())
      ) {
        // console.log(el)
        return true;
      }
    }
    return false;
  })
}

function getStorage(ctx) {
  
  return new Promise((resolve) => {
    
    ctx.storage.get(function (error, data) {
      if (error) resolve(error);
      var query = ctx.query.search;
      if(query === undefined) 
        // return everything
        resolve({meta: meta(), bealls: data});
      else {
        resolve({
          query: query, 
          meta: meta(), 
          bealls: {
            publishers: getFiltered(data.publishers, query),
            standalone: getFiltered(data.standalone, query),
            hijacked: getFiltered(data.hijacked, query),
            authentic: getFiltered(data.authentic, query)
          }
        });
      }
    });
  });
}

function writeData(req, res, data) {
  if  (req.method == 'GET') {
    return writeJSON(res, data);
  }
}


module.exports = 
  function (ctx, req, res) {
    // write the header and set the response type as a json
    res.writeHead(200, { 'Content-Type': 'application/json' });

    // console.log(ctx)
    
    // get storage (like v1)
    getStorage(ctx)
      .then(function (result) {
        // if query, match it against DOAJ
        // https://doaj.org/api/v1/search/journals/frontiers?pageSize=100
        // get 100 matches by relevance from DOAJ, push them into an array, and return the count and list
        
        if(result.query) {
          console.log('search DOAJ:' , result.query)
          https.get(`https://doaj.org/api/v1/search/journals/${result.query}?pageSize=30`, function(_res){
            var src = '';
            _res.on('data', function(d){ src += d; });
            _res.on('end', function(){
              // console.log('DOAJ: ', src)
              const doaj = JSON.parse(src)
              const titles = doaj.results.reduce((titles, obj) => {
                titles.push(obj.bibjson.title)
                return titles
              }, [])
              console.log('DOAJ titles: ' , titles.join())
              result['doaj'] = {
                'count': titles.length,
                'titles': titles,
              }
              writeData(req, res, result)
              res.end();
            });
          });
        } else {
          writeData(req, res, result)
          res.end();
        }
        
      })
    
  }