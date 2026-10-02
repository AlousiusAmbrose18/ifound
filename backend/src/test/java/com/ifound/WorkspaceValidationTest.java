package com.ifound;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.ws.rs.BadRequestException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class WorkspaceValidationTest {
 private final ObjectMapper mapper=new ObjectMapper();
 private ObjectNode workspace() throws Exception {return (ObjectNode)mapper.readTree("""
 {"alerts":[],"watch":[],"customers":[],"transactions":[],"rules":{"threshold":80,"amount":1000000,"velocity":5,"countryWeight":40,"locationWeight":25,"professionWeight":35,"screen":true,"transaction":true}}
 """);}
 @Test void acceptsValidWorkspace() throws Exception{assertDoesNotThrow(()->WorkspaceValidation.validate(workspace()));}
 @Test void rejectsInvalidRuleRange() throws Exception{var v=workspace();((ObjectNode)v.get("rules")).put("threshold",101);assertThrows(BadRequestException.class,()->WorkspaceValidation.validate(v));}
 @Test void rejectsFractionalVelocity() throws Exception{var v=workspace();((ObjectNode)v.get("rules")).put("velocity",1.5);assertThrows(BadRequestException.class,()->WorkspaceValidation.validate(v));}
 @Test void rejectsMalformedDate() throws Exception{var v=workspace();v.withArray("customers").add(mapper.readTree("""
 {"name":"Test","country":"India","dob":"2024-02-30","risk":20}
 """));assertThrows(BadRequestException.class,()->WorkspaceValidation.validate(v));}
 @Test void rejectsNegativeTransaction() throws Exception{var v=workspace();v.withArray("transactions").add(mapper.readTree("""
 {"name":"Test","destination":"India","amount":"-1","count":"1","flag":false}
 """));assertThrows(BadRequestException.class,()->WorkspaceValidation.validate(v));}
}
