package com.ifound;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.event.Observes;
import java.sql.*;
import java.util.*;
import java.math.BigDecimal;
import java.time.Instant;

@ApplicationScoped
public class BusinessStore {
 @Inject AgroalDataSource database;
 @Inject ObjectMapper mapper;
 @Inject AuthService auth;
 static final Map<String,String> TABLES=Map.of("customers","customers","watch","watchlist_records","alerts","alerts","transactions","transactions");
 public record Snapshot(long revision,ObjectNode workspace){}
 public record Outcome(long revision,ObjectNode workspace,JsonNode result){}
 @FunctionalInterface public interface Operation{JsonNode run(ObjectNode data)throws Exception;}
 void start(@Observes StartupEvent event)throws Exception{
  auth.bootstrap();
  try(var c=database.getConnection()){c.setAutoCommit(false);try(var q=c.prepareStatement("SELECT payload,relational_initialized FROM workspace WHERE id=1 FOR UPDATE");var r=q.executeQuery()){
   r.next();if(!r.getBoolean(2)){ObjectNode old=r.getString(1)==null?empty():(ObjectNode)mapper.readTree(r.getString(1));normalize(old);WorkspaceValidation.validate(old);write(c,old);try(var u=c.prepareStatement("UPDATE workspace SET relational_initialized=TRUE WHERE id=1")){u.executeUpdate();}audit(c,"system","MIGRATE_WORKSPACE","legacy snapshot");}c.commit();
  }catch(Exception e){c.rollback();throw e;}}
 }
 ObjectNode empty()throws Exception{return (ObjectNode)mapper.readTree("""
 {"alerts":[],"watch":[],"customers":[],"transactions":[],"rules":{"threshold":80,"amount":1000000,"velocity":5,"countryWeight":40,"locationWeight":25,"professionWeight":35,"screen":true,"transaction":true}}
 """);}
 void normalize(ObjectNode data){for(String key:TABLES.keySet())for(var record:data.withArray(key)){if(!record.has("id"))((ObjectNode)record).put("id",UUID.randomUUID().toString());}for(var t:data.withArray("transactions")){if(!t.has("customerId")){var matches=new ArrayList<JsonNode>();for(var customer:data.withArray("customers"))if(customer.path("name").asText().equalsIgnoreCase(t.path("name").asText()))matches.add(customer);if(matches.size()==1)((ObjectNode)t).put("customerId",matches.getFirst().path("id").asText());}}}
 ObjectNode read(Connection c)throws Exception{ObjectNode data=mapper.createObjectNode();for(var entry:TABLES.entrySet()){ArrayNode list=data.putArray(entry.getKey());try(var q=c.prepareStatement("SELECT record_data FROM "+entry.getValue()+" ORDER BY sort_order");var r=q.executeQuery()){while(r.next())list.add(mapper.readTree(r.getString(1)));}}try(var q=c.prepareStatement("SELECT record_data FROM rule_settings WHERE id=1");var r=q.executeQuery()){if(!r.next())throw new InternalServerErrorException("Rule settings are missing");data.set("rules",mapper.readTree(r.getString(1)));}return data;}
 public Snapshot snapshot()throws Exception{try(var c=database.getConnection()){c.setAutoCommit(false);try{long rev=lock(c);var result=new Snapshot(rev,read(c));c.commit();return result;}catch(Exception e){c.rollback();throw e;}}}
 long lock(Connection c)throws Exception{try(var q=c.prepareStatement("SELECT revision FROM workspace WHERE id=1 FOR UPDATE");var r=q.executeQuery()){r.next();return r.getLong(1);}}
 public Outcome mutate(Long expected,AuthService.User actor,String action,String subject,Operation operation)throws Exception{
  try(var c=database.getConnection()){c.setAutoCommit(false);try{long rev=lock(c);if(expected!=null&&expected!=rev)throw new WebApplicationException("Workspace changed in another session. Reload before retrying.",409);ObjectNode data=read(c);var result=operation.run(data);normalize(data);WorkspaceValidation.validate(data);write(c,data);try(var q=c.prepareStatement("UPDATE workspace SET revision=revision+1 WHERE id=1")){q.executeUpdate();}audit(c,actor.username(),action,subject);c.commit();return new Outcome(rev+1,data,result);}catch(Exception e){c.rollback();throw e;}}
 }
 void write(Connection c,ObjectNode data)throws Exception{
  for(var entry:TABLES.entrySet()){
   var existing=new HashSet<String>();try(var q=c.prepareStatement("SELECT id FROM "+entry.getValue());var r=q.executeQuery()){while(r.next())existing.add(r.getString(1));}
   var seen=new HashSet<String>();int index=0;
   for(var record:data.withArray(entry.getKey())){
    String id=record.path("id").asText();if(id.isBlank()||id.length()>100||!seen.add(id))throw new BadRequestException("Invalid or duplicate record IDs.");existing.remove(id);
    String sql=entry.getKey().equals("transactions")?"INSERT INTO transactions(id,record_data,sort_order,customer_id,amount,occurred_at) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE record_data=VALUES(record_data),sort_order=VALUES(sort_order),customer_id=VALUES(customer_id),amount=VALUES(amount),occurred_at=VALUES(occurred_at)":"INSERT INTO "+entry.getValue()+"(id,record_data,sort_order) VALUES(?,?,?) ON DUPLICATE KEY UPDATE record_data=VALUES(record_data),sort_order=VALUES(sort_order)";
    try(var q=c.prepareStatement(sql)){q.setString(1,id);q.setString(2,mapper.writeValueAsString(record));q.setInt(3,index++);if(entry.getKey().equals("transactions")){q.setString(4,record.path("customerId").isMissingNode()?null:record.get("customerId").asText());q.setBigDecimal(5,new BigDecimal(record.get("amount").asText()));q.setTimestamp(6,record.has("transactionDate")?Timestamp.from(Instant.parse(record.get("transactionDate").asText())):record.has("at")?Timestamp.from(Instant.parse(record.get("at").asText())):null);}q.executeUpdate();}
   }
   for(String id:existing)try(var q=c.prepareStatement("DELETE FROM "+entry.getValue()+" WHERE id=?")){q.setString(1,id);q.executeUpdate();}
  }
  try(var q=c.prepareStatement("INSERT INTO rule_settings(id,record_data) VALUES(1,?) ON DUPLICATE KEY UPDATE record_data=VALUES(record_data)")){q.setString(1,mapper.writeValueAsString(data.get("rules")));q.executeUpdate();}
 }
 public static void audit(Connection c,String actor,String action,String subject)throws SQLException{try(var q=c.prepareStatement("INSERT INTO audit_events(actor,action,subject) VALUES(?,?,?)")){q.setString(1,actor);q.setString(2,action);q.setString(3,subject==null?"":subject);q.executeUpdate();}}
 public ArrayNode auditLog(int limit)throws Exception{ArrayNode out=mapper.createArrayNode();try(var c=database.getConnection();var q=c.prepareStatement("SELECT id,actor,action,subject,occurred_at FROM audit_events ORDER BY id DESC LIMIT ?")){q.setInt(1,Math.max(1,Math.min(limit,1000)));try(var r=q.executeQuery()){while(r.next()){var row=out.addObject();row.put("id",r.getLong(1));row.put("actor",r.getString(2));row.put("action",r.getString(3));row.put("subject",r.getString(4));row.put("at",r.getTimestamp(5).toInstant().toString());}}}return out;}
}
