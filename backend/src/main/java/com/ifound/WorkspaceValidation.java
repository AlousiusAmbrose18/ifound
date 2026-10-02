package com.ifound;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.BadRequestException;
import java.time.LocalDate;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

final class WorkspaceValidation {
 private static void require(boolean ok){if(!ok)throw new BadRequestException("Invalid workspace data");}
 private static void text(JsonNode node,String key,int max){require(node!=null&&node.isObject()&&node.has(key)&&node.get(key).isTextual()&&node.get(key).textValue().length()<=max);}
 private static void number(JsonNode node,String key,double min,double max){var v=node.get(key);require(v!=null&&v.isNumber()&&Double.isFinite(v.asDouble())&&v.asDouble()>=min&&v.asDouble()<=max);}
 private static void choice(JsonNode node,String key,String...values){text(node,key,100);require(Set.of(values).contains(node.get(key).asText()));}
 private static void date(JsonNode node){text(node,"dob",10);String dob=node.get("dob").asText();if(!dob.isEmpty())try{require(!LocalDate.parse(dob).isAfter(LocalDate.now(java.time.ZoneOffset.UTC)));}catch(Exception e){throw new BadRequestException("Invalid date of birth");}}
 private static void timestamp(JsonNode node,String key){if(node.has(key)){text(node,key,100);try{Instant.parse(node.get(key).asText());}catch(Exception e){throw new BadRequestException("Invalid timestamp");}}}
 static void validate(JsonNode root){
  require(root!=null&&root.isObject());var rules=root.get("rules");require(rules!=null&&rules.isObject());
  number(rules,"threshold",1,100);require(rules.get("threshold").asDouble()%1==0);number(rules,"amount",1,1e12);number(rules,"velocity",1,100000);require(rules.get("velocity").asDouble()%1==0);
  for(String key:new String[]{"countryWeight","locationWeight","professionWeight"}){number(rules,key,1,100);require(rules.get(key).asDouble()%1==0);}
  for(String key:new String[]{"screen","transaction"})require(rules.has(key)&&rules.get(key).isBoolean());
  for(String key:new String[]{"alerts","watch","customers","transactions"}){var list=root.get(key);require(list!=null&&list.isArray()&&list.size()<=(key.equals("watch")?10000:20000));for(var record:list){require(record.isObject());text(record,"name",200);}}
  var ids=new HashSet<String>();for(var a:root.get("alerts")){text(a,"id",100);require(ids.add(a.get("id").asText()));choice(a,"type","Name screening","Transaction");choice(a,"risk","High","Medium","Low");choice(a,"status","Open","In review","Closed");number(a,"score",0,100);text(a,"date",100);text(a,"detail",4000);if(a.has("reviews")){require(a.get("reviews").isArray()&&a.get("reviews").size()<=10000);for(var review:a.get("reviews")){choice(review,"status","Open","In review","Closed");text(review,"note",2000);require(review.has("at"));timestamp(review,"at");}}}
  for(var w:root.get("watch")){require(!w.get("name").asText().isBlank());text(w,"country",100);text(w,"source",200);date(w);for(String key:new String[]{"first","middle","last","location","profession"})if(w.has(key))text(w,key,200);for(String key:new String[]{"countryRisk","locationRisk","professionRisk"})if(w.has(key)){number(w,key,20,90);require(Set.of(20,50,90).contains(w.get(key).asInt())&&w.get(key).isIntegralNumber());}}
  for(var c:root.get("customers")){text(c,"country",100);date(c);number(c,"risk",0,100);}
  for(var t:root.get("transactions")){for(String key:new String[]{"reference","beneficiaryAccount","channel"})if(t.has(key))text(t,key,100);if(t.has("beneficiary"))text(t,"beneficiary",200);if(t.has("purpose"))text(t,"purpose",500);if(t.has("currency"))choice(t,"currency","INR");timestamp(t,"transactionDate");text(t,"destination",100);text(t,"amount",100);text(t,"count",100);require(t.has("flag")&&t.get("flag").isBoolean());try{double amount=Double.parseDouble(t.get("amount").asText()),count=Double.parseDouble(t.get("count").asText());require(Double.isFinite(amount)&&amount>=0.01&&amount<=1e12&&count>=1&&count<=100000);}catch(NumberFormatException e){throw new BadRequestException("Invalid transaction");}timestamp(t,"at");}
 }
}
