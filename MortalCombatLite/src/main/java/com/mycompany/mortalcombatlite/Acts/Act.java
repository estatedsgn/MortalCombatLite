/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.mycompany.mortalcombatlite.Acts;

import com.mycompany.mortalcombatlite.Heros.Hero;

/**
 *
 * @author nyaku
 */



public abstract class Act {
    public abstract String getType();
    public abstract void realisation(Hero hero1, Hero fighter2, String fighter2ActionType);
}
