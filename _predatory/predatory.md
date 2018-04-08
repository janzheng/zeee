

# Beall’s List API of predatory journals 

## Notes

<!-- 
    https://tomasz.janczuk.org/2017/09/auth0-webtasks-and-node-8.html
    Node 8 account: https://sandbox.auth0-extend.com/edit/wt-ece6cabd401b68e3fc2743969a9c99f0-0#webtaskName=whatnode&token=eyJhbGciOiJIUzI1NiIsImtpZCI6IjIifQ.eyJqdGkiOiI4YzY4ZDJmMjYwMDU0NTNkYjY0NGEyMzIwY2JhMDdiZCIsImlhdCI6MTUyMjEyOTQwOCwiY2EiOlsiOTAwNzMzNGRiMDhjNGQ2M2E0MTNjZGFmM2YzYjYxNGMiXSwiZGQiOjEsInRlbiI6Ii9ed3QtZWNlNmNhYmQ0MDFiNjhlM2ZjMjc0Mzk2OWE5Yzk5ZjAtWzAtMV0kLyJ9.ymHJbNAlOM849Ue7iutsM9q54cM6yoPC0kE48ljaWg8

    - same password/email as before 
 -->

- Have a Bealls list / blacklist and a whitelist (from DOAJ, Clarivate, NCBI?)
  - create a page to detect if a journal is on a site
  - API for returning if a journal is on whitelist or note
    - using partial name, exact name, or journal URL


- https://beallslist.weebly.com/
- https://scholarlykitchen.sspnet.org/2017/07/25/cabells-new-predatory-journal-blacklist-review/

- API for Bealls List
  - BLACKLIST
  - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/predatory?search=front
  - https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/predatory
  - get every data point that's on the list
  - Convert the bealls list into a webtask API
  - Apparently it’s semi out of date, but also an impossible task to update as well
  - consider crowdsourced way of using "approved" editors, with version control
  - Cabell’s is another list you have to pay for
  - https://debunkingdenialism.com/2017/06/15/we-now-know-why-jeffrey-beall-removed-list-of-allegedly-predatory-publishers/
  - was able to capture all of these in the .json file! and the new code grabs all of these now
  - the list is HUGE and includes several categories:
    - publishers
    - standalone journals
    - hijacked journals
  - DATA INTEGRITY NOTE:
    - the beallslist.json has been REPAIRED
      - IISTE listing error

- API for checking veracity / WHITELIST
  - return info whether something exists on DOAJ/JCR, and does not exist on bealls
    - good indicator that it's not predatory
  - should also auto-search DOAJ and JCR to verify veracity of journal
    - https://beallslist.weebly.com/how-to-recognize-predatory-journals.html
    - DOAJ:
      - http://doaj.org/api/v1/search/journals/{search_query}
        - ex: https://doaj.org/api/v1/search/journals/frontiers
      - /api/v1/journals/{journal_id}
      - /api/v1/search/articles/{search_query}
      - https://doaj.org/api/v1/search/journals/frontiers%20in%20microbiology
  - https://clarivate.com/about-us/what-we-do/


- reddit account to publicize it:
  - "beallpi" / qwerty1234
  - https://www.reddit.com/r/AskAcademia/comments/88mtz3/bealls_list_api/








## API / Webtask

- Built on Webtask, stored inside the Webtask Storage system
- Endpoint currently at: https://wt-ece6cabd401b68e3fc2743969a9c99f0-0.run.webtask.io/beallslist but might switch to a zeee.co custom domain, like zeee.co/beallslist
- Currently updated by hand / through scraping, not through an interface (only GET so far)

~~~
ctx.storage.get(function (error, data) {
    if (error) return cb(error);
    // ...
});
~~~

- The Webtask storage looks like:
{
  "listType": [
    {
      "name": "journalName",
      "links": ["http://journalLink.com"],
      "note": "journalNote"
    }
  ]
}


### Use filter/searchers

- https://webtask.io/docs/parameters
  - [url]?search=Something here yeah?



### Scraper
- scraping script from the weebly site

$('.paragraph li')[10]

each part
- name:  $($('.paragraph li')[9]).find('a').html()
  - name is almost always the first a's content. sometimes there's a typo tho
- links:  $($('.paragraph li')[9]).find('a').attr('href') 
- note:  $($('.paragraph li')[9]).text()

- better wrapper: $($('.paragraph li')[10]).children($('a')).html()
- for the note, grab both journal name AND the note (otherwise the note itself might not make sense; can do a substr exclusion if you really only want the note itself)

- together for all (console command) works for publishers and standalone:

~~~
var obj = { "list": [] }
$('.paragraph li').each(function(i) {
  let name = $(this).find('a').html();
  let links = [];
    $(this).find('a').each(function(j){links.push($(this).attr('href'))});
  let note = $(this).text();
    <!-- exclude the name from the note (but sometimes the name doesn't exist, or links don't exist) -->
    note = note.replace(name,"");
    if(name == "") { name = name; note = ""; }
  obj.list.push({"name": name, "links":links, "note": note})
  <!-- console.log(`${name} ${note}`, links) -->
}); console.log('full obj:', obj, 'JStr', JSON.stringify(obj));
~~~

- this works for hijacked journals:

~~~
var obj = { "list": [] }
$('.paragraph td:first-of-type').each(function(i) {
  let name = $(this).find('a').html();
  let links = [];
    $(this).find('a').each(function(j){links.push($(this).attr('href'))});
  let note = $(this).text();
    <!-- exclude the name from the note (but sometimes the name doesn't exist, or links don't exist) -->
    note = note.replace(name,"");
    if(name == "") { name = name; note = ""; }
  obj.list.push({"name": name, "links":links, "note": note})
  <!-- console.log(`${name} ${note}`, links) -->
}); console.log('full obj:', obj, 'JStr', JSON.stringify(obj));
~~~


- this works for hijacked (authentic col) journals:

~~~
var obj = { "list": [] }
$('.paragraph td:last-of-type').each(function(i) {
  let name = $(this).find('a').html();
  let links = [];
    $(this).find('a').each(function(j){links.push($(this).attr('href'))});
  let note = $(this).text();
    <!-- exclude the name from the note (but sometimes the name doesn't exist, or links don't exist) -->
    note = note.replace(name,"");
    if(name == "") { name = name; note = ""; }
  obj.list.push({"name": name, "links":links, "note": note})
  <!-- console.log(`${name} ${note}`, links) -->
}); console.log('full obj:', obj, 'JStr', JSON.stringify(obj));
~~~










