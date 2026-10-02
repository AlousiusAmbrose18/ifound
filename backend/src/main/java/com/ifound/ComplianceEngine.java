package com.ifound;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import jakarta.ws.rs.*;
import java.text.Normalizer;
import java.time.*;
import java.math.BigDecimal;
import java.util.*;

public final class ComplianceEngine {
 static String required(JsonNode n,String key,int max){String v=optional(n,key,max);if(v.isBlank())throw new BadRequestException(key+" is required.");return v;}
 static String optional(JsonNode n,String key,int max){if(n==null||!n.isObject())throw new BadRequestException("A JSON object is required.");var node=n.get(key);if(node==null)return "";if(!node.isTextual()||node.asText().trim().length()>max)throw new BadRequestException(key+" must be text with at most "+max+" characters.");return node.asText().trim();}
 static void dob(String value){if(!value.isEmpty())try{if(!value.matches("\\d{4}-\\d{2}-\\d{2}")||LocalDate.parse(value).isAfter(LocalDate.now(ZoneOffset.UTC)))throw new IllegalArgumentException();}catch(Exception e){throw new BadRequestException("Enter a valid past date of birth.");}}
 static String normalize(String value){var s=Normalizer.normalize(value.toLowerCase(Locale.ROOT),Normalizer.Form.NFD).replaceAll("[\\u0300-\\u036f]","").replaceAll("[^\\p{L}\\p{N}\\s]"," ").trim();return Arrays.stream(s.split("\\s+")).filter(t->!t.isEmpty()).sorted().reduce((a,b)->a+" "+b).orElse("");}
 public static int similarity(String first,String second){String a=normalize(first),b=normalize(second);if(a.isEmpty()||b.isEmpty())return 0;int[] prev=new int[b.length()+1];for(int j=0;j<=b.length();j++)prev[j]=j;for(int i=1;i<=a.length();i++){int[] row=new int[b.length()+1];row[0]=i;for(int j=1;j<=b.length();j++)row[j]=Math.min(Math.min(prev[j]+1,row[j-1]+1),prev[j-1]+(a.charAt(i-1)==b.charAt(j-1)?0:1));prev=row;}return (int)Math.round(100.0*(1-(double)prev[b.length()]/Math.max(a.length(),b.length())));}
 static String soundex(String token){
  if(!token.matches("[a-z]{3,}"))return "";String codes="01230120022455012623010202";StringBuilder out=new StringBuilder(token.substring(0,1).toUpperCase(Locale.ROOT));char previous=codes.charAt(token.charAt(0)-'a');
  for(int i=1;i<token.length()&&out.length()<4;i++){char letter=token.charAt(i);if(letter=='h'||letter=='w')continue;char code=codes.charAt(letter-'a');if(code!='0'&&code!=previous)out.append(code);previous=code;}
  while(out.length()<4)out.append('0');return out.toString();
 }
 static ObjectNode nameMatch(ObjectMapper mapper,String input,String watchlist){
  int textScore=similarity(input,watchlist);var result=mapper.createObjectNode().put("score",textScore).put("textScore",textScore).put("matchMethod",textScore==100?"Exact name":"Fuzzy name");result.putArray("matchedTokens");
  String a=normalize(input),b=normalize(watchlist);if(a.isEmpty()||b.isEmpty()||textScore==100)return result;
  var entered=new ArrayList<>(Arrays.asList(a.split(" ")));entered.sort(Comparator.comparingInt(String::length).reversed().thenComparing(Comparator.naturalOrder()));var candidates=Arrays.asList(b.split(" "));if(entered.size()>candidates.size())return result;
  var used=new HashSet<Integer>();var tokens=mapper.createArrayNode();
  for(String token:entered){String code=soundex(token);if(code.isEmpty()||code.endsWith("000"))return result;int best=-1,bestScore=59;
   for(int i=0;i<candidates.size();i++)if(!used.contains(i)&&code.equals(soundex(candidates.get(i)))){int score=similarity(token,candidates.get(i));if(score>bestScore){best=i;bestScore=score;}}
   if(best<0)return result;used.add(best);tokens.addObject().put("input",token).put("watchlist",candidates.get(best)).put("code",code);
  }
  int phoneticScore=entered.size()==candidates.size()?92:90;if(phoneticScore>textScore){result.put("score",phoneticScore).put("matchMethod","Phonetic token match");result.set("matchedTokens",tokens);}return result;
 }
 static int riskInput(JsonNode request,String key){var node=request.get(key);if(node==null||!(node.isIntegralNumber()||node.isTextual()&&node.asText().matches("20|50|90")))throw new BadRequestException(key+" must be 20, 50 or 90.");int v=node.asInt(-1);if(!Set.of(20,50,90).contains(v))throw new BadRequestException(key+" must be 20, 50 or 90.");return v;}
 static ObjectNode customer(ObjectMapper mapper,JsonNode request,String id){
  String first=required(request,"first",200),middle=optional(request,"middle",200),last=optional(request,"last",200);for(String part:new String[]{first,last})if(!part.isBlank()&&!part.matches("(?s).*\\p{L}.*"))throw new BadRequestException("Names must contain letters.");String name=String.join(" ",Arrays.stream(new String[]{first,middle,last}).filter(v->!v.isBlank()).toList());if(name.length()>200)throw new BadRequestException("Full name must be at most 200 characters.");
  var c=mapper.createObjectNode();c.put("id",id);c.put("first",first);c.put("middle",middle);c.put("last",last);c.put("name",name);c.put("country",required(request,"country",100));c.put("location",required(request,"location",200));c.put("profession",optional(request,"profession",200));String date=optional(request,"dob",10);dob(date);c.put("dob",date);for(String k:new String[]{"countryRisk","locationRisk","professionRisk"})c.put(k,riskInput(request,k));c.put("createdAt",Instant.now().toString());return c;
 }
 static ObjectNode find(ObjectNode data,String collection,String id){for(var r:data.withArray(collection))if(r.path("id").asText().equals(id))return (ObjectNode)r;throw new NotFoundException("Record was not found.");}
 static void prepend(ArrayNode list,JsonNode value){list.insert(0,value);}
 static ObjectNode screen(ObjectMapper mapper,ObjectNode data,ObjectNode customer){
  var rules=data.get("rules");int defaultRisk=customer.path("risk").asInt(20)>=70?90:customer.path("risk").asInt(20)>=35?50:20;
  double sum=0,weights=0;for(String k:new String[]{"country","location","profession"}){double w=rules.path(k+"Weight").asDouble();sum+=customer.path(k+"Risk").asInt(defaultRisk)*w;weights+=w;}
  int score=(int)Math.round(sum/weights);customer.put("risk",score);customer.put("screenedAt",Instant.now().toString());var matches=new ArrayList<ObjectNode>();for(var record:data.withArray("watch")){if(!customer.path("id").asText().isEmpty()&&customer.path("id").asText().equals(record.path("customerId").asText()))continue;var matching=nameMatch(mapper,customer.path("name").asText(),record.path("name").asText());int match=matching.path("score").asInt();if(match>=rules.path("threshold").asInt()){var hit=((ObjectNode)record).deepCopy();hit.setAll(matching);matches.add(hit);}}matches.sort(Comparator.comparingInt((ObjectNode n)->n.path("score").asInt()).reversed());
  var summary=mapper.createObjectNode();summary.put("customerId",customer.path("id").asText());summary.put("risk",score);summary.put("matchCount",matches.size());summary.put("alertCount",rules.path("screen").asBoolean()?matches.size():0);summary.put("at",customer.get("screenedAt").asText());var evidence=summary.putArray("matches");matches.stream().limit(100).forEach(evidence::add);customer.set("lastScreening",summary.deepCopy());
  if(rules.path("screen").asBoolean())for(var hit:matches){var alert=mapper.createObjectNode();alert.put("id","ALT-"+UUID.randomUUID());alert.put("customerId",customer.path("id").asText());alert.put("watchlistId",hit.path("id").asText());alert.put("name",customer.path("name").asText());alert.put("type","Name screening");alert.put("score",hit.path("score").asInt());alert.put("risk",score>=70?"High":score>=35?"Medium":"Low");alert.put("status","Open");alert.put("date",Instant.now().toString());alert.put("detail","Matched "+hit.path("name").asText()+" ("+hit.path("source").asText()+"). "+hit.path("matchMethod").asText()+"; match score "+hit.path("score").asInt()+"%; text similarity "+hit.path("textScore").asInt()+"%. Country: "+(customer.path("country").asText().equalsIgnoreCase(hit.path("country").asText())?"match":"different / unknown")+"; DOB: "+(!customer.path("dob").asText().isEmpty()&&customer.path("dob").asText().equals(hit.path("dob").asText())?"match":"different / unknown")+". Threshold "+rules.path("threshold").asInt()+"%.");alert.set("evidence",hit);alert.putArray("reviews");prepend(data.withArray("alerts"),alert);}
  syncCustomerWatch(mapper,data,customer);
  return summary;
 }
 static void syncCustomerWatch(ObjectMapper mapper,ObjectNode data,ObjectNode customer){
  String id=customer.path("id").asText();ObjectNode watch=null;
  for(var record:data.withArray("watch"))if(id.equals(record.path("customerId").asText())){watch=(ObjectNode)record;break;}
  if(watch==null){watch=mapper.createObjectNode();watch.put("id","customer-"+id);data.withArray("watch").add(watch);}
  watch.put("customerId",id);for(String key:new String[]{"name","country","dob"})watch.put(key,customer.path(key).asText());watch.put("source","Customer screening");watchDetails(customer,watch);
 }
 static void watchDetails(JsonNode request,ObjectNode watch){
  for(String key:new String[]{"first","middle","last","location","profession"})watch.put(key,optional(request,key,200));
  for(String key:new String[]{"countryRisk","locationRisk","professionRisk"})watch.put(key,request.has(key)?riskInput(request,key):20);
 }
 static ObjectNode transaction(ObjectMapper mapper,ObjectNode data,JsonNode request){
  String customerId=required(request,"customerId",100);var customer=find(data,"customers",customerId);String destination=required(request,"destination",100);BigDecimal amount;
  try{var value=request.get("amount");if(value==null||(!value.isTextual()&&!value.isNumber()))throw new IllegalArgumentException();amount=new BigDecimal(value.asText()).setScale(2,java.math.RoundingMode.UNNECESSARY);if(amount.compareTo(new BigDecimal("0.01"))<0||amount.compareTo(new BigDecimal("1000000000000"))>0)throw new IllegalArgumentException();}catch(Exception e){throw new BadRequestException("Amount must be ₹0.01–₹1 trillion, with at most two decimal places.");}
  String reference=required(request,"reference",100),beneficiary=required(request,"beneficiary",200),account=required(request,"beneficiaryAccount",100),channel=required(request,"channel",100),purpose=required(request,"purpose",500),currency=required(request,"currency",3),date=required(request,"transactionDate",100);
  if(!currency.equals("INR"))throw new BadRequestException("Only INR transactions are supported.");
  if(!Set.of("Bank transfer","UPI","Card","Cash").contains(channel))throw new BadRequestException("Invalid transaction channel.");
  Instant now=Instant.now(),occurred;try{occurred=Instant.parse(date);if(occurred.isAfter(now)||occurred.isBefore(Instant.parse("1970-01-02T00:00:00Z")))throw new IllegalArgumentException();}catch(Exception e){throw new BadRequestException("Enter a valid transaction date from 1970 onward that is not in the future.");}
  int count=1;for(var prior:data.withArray("transactions"))if(prior.path("customerId").asText().equals(customerId)){String timestamp=prior.path("transactionDate").asText(prior.path("at").asText());if(!timestamp.isEmpty()){var at=Instant.parse(timestamp);if(!at.isBefore(occurred.minusSeconds(86400))&&!at.isAfter(occurred))count++;}}
  var rules=data.get("rules");var reasons=new ArrayList<String>();if(rules.path("transaction").asBoolean()){if(amount.compareTo(new BigDecimal(rules.get("amount").asText()))>=0)reasons.add("High-value transfer");if(count>=rules.path("velocity").asInt())reasons.add("Transaction velocity");}
  var matches=mapper.createArrayNode();if(rules.path("screen").asBoolean())for(var w:data.withArray("watch")){var matching=nameMatch(mapper,beneficiary,w.path("name").asText());int score=matching.path("score").asInt();if(score>=rules.path("threshold").asInt()){var hit=((ObjectNode)w).deepCopy();hit.setAll(matching);matches.add(hit);}}
  if(!matches.isEmpty())reasons.add("Beneficiary watchlist match");boolean flag=!reasons.isEmpty();
  String key=optional(request,"idempotencyKey",100);if(!key.isEmpty()&&!key.matches("[A-Za-z0-9_-]{16,100}"))throw new BadRequestException("Invalid idempotency key.");String id=key.isEmpty()?UUID.randomUUID().toString():key;
  for(var prior:data.withArray("transactions"))if(prior.path("id").asText().equals(id)||prior.path("reference").asText().equalsIgnoreCase(reference))throw new WebApplicationException("Transaction reference or key already exists. Refresh to see the recorded transfer.",409);
  var t=mapper.createObjectNode();t.put("id",id);t.put("reference",reference);t.put("customerId",customerId);t.put("name",customer.path("name").asText());t.put("beneficiary",beneficiary);t.put("beneficiaryAccount",account);t.put("channel",channel);t.put("purpose",purpose);t.put("currency",currency);t.put("transactionDate",occurred.toString());t.put("amount",amount.toPlainString());t.put("destination",destination);t.put("count",Integer.toString(count));t.put("at",now.toString());t.put("flag",flag);t.put("screened",rules.path("transaction").asBoolean()||rules.path("screen").asBoolean());var evidence=t.putArray("reasons");reasons.forEach(evidence::add);t.set("screeningRules",rules.deepCopy());t.set("beneficiaryMatches",matches);prepend(data.withArray("transactions"),t);
  if(flag){var a=mapper.createObjectNode();a.put("id","ALT-"+UUID.randomUUID());a.put("customerId",customerId);a.put("transactionId",id);a.put("name",customer.path("name").asText());a.put("type","Transaction");a.put("score",matches.isEmpty()?(reasons.size()>1?95:85):matches.get(0).path("score").asInt());a.put("risk","High");a.put("status","Open");a.put("date",now.toString());a.put("detail",String.join(" and ",reasons)+". Reference "+reference+"; beneficiary "+beneficiary+"; amount ₹"+amount.toPlainString()+"; "+count+" transfers in the preceding 24 hours.");a.set("beneficiaryMatches",matches.deepCopy());a.putArray("reviews");prepend(data.withArray("alerts"),a);}return t;
 }
}
