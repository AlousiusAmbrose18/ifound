package com.ifound;

import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import java.security.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@ApplicationScoped
public class AuthService {
 @Inject AgroalDataSource database;
 @ConfigProperty(name="ifound.api-token") String serviceToken;
 @ConfigProperty(name="ifound.admin-username",defaultValue="admin") String adminUsername;
 @ConfigProperty(name="ifound.admin-password") String adminPassword;
 public record User(String id,String username,String role) {}
 private static final SecureRandom RANDOM=new SecureRandom();
 public void service(String authorization){if(authorization==null||serviceToken.length()<32||!MessageDigest.isEqual(("Bearer "+serviceToken).getBytes(StandardCharsets.UTF_8),authorization.getBytes(StandardCharsets.UTF_8)))throw new NotAuthorizedException("Bearer");}
 public User user(String authorization,String session){service(authorization);if(session==null||session.length()>200)throw new NotAuthorizedException("Session");try(var c=database.getConnection();var q=c.prepareStatement("SELECT u.id,u.username,u.role FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.active=TRUE")){q.setString(1,sha(session));try(var r=q.executeQuery()){if(!r.next())throw new NotAuthorizedException("Session");return new User(r.getString(1),r.getString(2),r.getString(3));}}catch(SQLException e){throw new InternalServerErrorException();}}
 public void write(User u){if(u.role().equals("Viewer"))throw new ForbiddenException("Viewer accounts cannot change records.");}
 public void admin(User u){if(!u.role().equals("Admin"))throw new ForbiddenException("Administrator access is required.");}
 public void bootstrap() throws Exception {if(adminPassword.length()<12)throw new IllegalStateException("ADMIN_PASSWORD must contain at least 12 characters");username(adminUsername);try(var c=database.getConnection();var q=c.prepareStatement("INSERT IGNORE INTO app_users(id,username,password_hash,role) VALUES(?,?,?,'Admin')")){q.setString(1,UUID.randomUUID().toString());q.setString(2,adminUsername.toLowerCase(Locale.ROOT));q.setString(3,hash(adminPassword));q.executeUpdate();}}
 public static String username(String value){if(value==null||!value.matches("[A-Za-z0-9._-]{3,64}"))throw new BadRequestException("Username must use 3–64 letters, digits, periods, underscores or hyphens.");return value.toLowerCase(Locale.ROOT);}
 public static String hash(String password) throws Exception {if(password==null||password.length()<12||password.length()>200)throw new BadRequestException("Password must contain 12–200 characters.");byte[] salt=new byte[16];RANDOM.nextBytes(salt);return "210000:"+HexFormat.of().formatHex(salt)+":"+HexFormat.of().formatHex(derive(password,salt,210000));}
 static byte[] derive(String password,byte[] salt,int iterations) throws Exception {var spec=new PBEKeySpec(password.toCharArray(),salt,iterations,256);try{return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();}finally{spec.clearPassword();}}
 static boolean verify(String password,String stored) throws Exception {if(password==null||password.length()>200)return false;String[] parts=stored.split(":");return MessageDigest.isEqual(HexFormat.of().parseHex(parts[2]),derive(password,HexFormat.of().parseHex(parts[1]),Integer.parseInt(parts[0])));}
 static String sha(String token){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
 public Map<String,Object> login(String name,String password) throws Exception {
  String username=username(name);
  try(var c=database.getConnection()){
   c.setAutoCommit(false);
   try{
    try(var q=c.prepareStatement("INSERT IGNORE INTO login_attempts(username,failures) VALUES(?,0)")){q.setString(1,username);q.executeUpdate();}
    try(var q=c.prepareStatement("SELECT failures,locked_until FROM login_attempts WHERE username=? FOR UPDATE")){q.setString(1,username);try(var r=q.executeQuery()){r.next();Timestamp lock=r.getTimestamp(2);if(lock!=null&&lock.toInstant().isAfter(Instant.now()))throw new WebApplicationException("Too many failed attempts. Try again in 15 minutes.",429);}}
    User user=null;String passwordHash=null;
    try(var q=c.prepareStatement("SELECT id,username,role,password_hash FROM app_users WHERE username=? AND active=TRUE")){q.setString(1,username);try(var r=q.executeQuery()){if(r.next()){user=new User(r.getString(1),r.getString(2),r.getString(3));passwordHash=r.getString(4);}}}
    boolean valid=verify(password,passwordHash==null?"210000:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000":passwordHash);
    if(user==null||!valid){try(var q=c.prepareStatement("UPDATE login_attempts SET failures=failures+1,locked_until=IF(failures>=5,TIMESTAMPADD(MINUTE,15,CURRENT_TIMESTAMP),NULL) WHERE username=?")){q.setString(1,username);q.executeUpdate();}c.commit();throw new NotAuthorizedException("Invalid username or password.");}
    try(var q=c.prepareStatement("UPDATE login_attempts SET failures=0,locked_until=NULL WHERE username=?")){q.setString(1,username);q.executeUpdate();}
    byte[] bytes=new byte[32];RANDOM.nextBytes(bytes);String token=HexFormat.of().formatHex(bytes);
    try(var q=c.prepareStatement("DELETE FROM app_sessions WHERE expires_at<CURRENT_TIMESTAMP")){q.executeUpdate();}
    try(var q=c.prepareStatement("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")){q.setString(1,sha(token));q.setString(2,user.id());q.setTimestamp(3,Timestamp.from(Instant.now().plusSeconds(43200)));q.executeUpdate();}
    BusinessStore.audit(c,user.username(),"LOGIN",user.id());c.commit();return Map.of("user",user,"token",token);
   }catch(Exception e){c.rollback();throw e;}
  }
 }
 public void logout(User user,String token) throws Exception {try(var c=database.getConnection();var q=c.prepareStatement("DELETE FROM app_sessions WHERE token_hash=?")){q.setString(1,sha(token));q.executeUpdate();BusinessStore.audit(c,user.username(),"LOGOUT",user.id());}}
}
